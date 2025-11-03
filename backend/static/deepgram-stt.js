// Deepgram Live Streaming STT Module
// This module handles real-time speech-to-text using Deepgram's WebSocket API

class DeepgramSTT {
  constructor() {
    this.deepgramApiKey = null;
    this.connection = null;
    this.mediaRecorder = null;
    this.isListening = false;
    this.onTranscriptCallback = null;
    this.onErrorCallback = null;
  }

  async initialize() {
    // Get Deepgram API key from backend
    try {
      const response = await fetch(`${window.location.origin}/deepgram/api-key`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      this.deepgramApiKey = data.api_key;
      console.log("✅ Deepgram API key obtained");
      return true;
    } catch (error) {
      console.error("❌ Failed to get Deepgram API key:", error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      return false;
    }
  }

  async startListening(audioStream) {
    if (this.isListening) {
      console.warn("Already listening");
      return;
    }

    if (!this.deepgramApiKey) {
      await this.initialize();
    }

    try {
      // Create Deepgram WebSocket connection
      const { createClient, LiveTranscriptionEvents } = window.deepgram;
      const deepgram = createClient(this.deepgramApiKey);

      this.connection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        punctuate: true,
        interim_results: false,  // Only get final results
        endpointing: 300,  // Milliseconds of silence before finalizing
      });

      // Set up event listeners
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("🎤 Deepgram connection opened");
        this.isListening = true;

        // Start sending audio data
        this.mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: "audio/webm",
        });

        this.mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && this.connection) {
            this.connection.send(event.data);
          }
        });

        this.mediaRecorder.start(250); // Send data every 250ms
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        
        if (transcript && transcript.trim().length > 0) {
          console.log("📝 Transcript:", transcript);
          
          if (this.onTranscriptCallback) {
            this.onTranscriptCallback(transcript);
          }
        }
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("🔌 Deepgram connection closed");
        this.isListening = false;
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("❌ Deepgram error:", error);
        this.isListening = false;
        
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      });

      this.connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log("📊 Deepgram metadata:", data);
      });

    } catch (error) {
      console.error("❌ Failed to start Deepgram listening:", error);
      this.isListening = false;
      
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    }
  }

  stopListening() {
    if (!this.isListening) {
      return;
    }

    console.log("⏹️ Stopping Deepgram listening");

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }

    this.isListening = false;
  }

  onTranscript(callback) {
    this.onTranscriptCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }
}

// Export for use in main script
window.DeepgramSTT = DeepgramSTT;
