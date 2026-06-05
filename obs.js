document.addEventListener('DOMContentLoaded', () => {
    const remoteVideo = document.getElementById('remoteVideo');
    const noSignal = document.getElementById('noSignal');
    
    // Get Stream ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const streamId = urlParams.get('id');

    if (!streamId) {
        noSignal.querySelector('h2').textContent = "ERROR";
        noSignal.querySelector('p').textContent = "MISSING STREAM ID IN URL";
        return;
    }

    // Initialize PeerJS
    // We append '-obs' to the streamId to create a predictable ID for the receiver
    const obsPeerId = `potato-${streamId}-obs`;
    
    const peer = new Peer(obsPeerId, {
        debug: 2
    });

    peer.on('open', (id) => {
        console.log('OBS Receiver initialized with ID: ' + id);
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        // If the ID is taken, it might mean another OBS source is open. 
        // Not a huge deal if it's the same stream, but good to log.
    });

    // Listen for incoming calls
    peer.on('call', (call) => {
        console.log('Incoming call from Sender...');
        
        // Answer the call immediately without sending any stream back
        call.answer();

        // When we receive the stream from the sender
        call.on('stream', (remoteStream) => {
            console.log('Stream received, attaching to video...');
            remoteVideo.srcObject = remoteStream;
            
            // Hide "No Signal" once video starts playing
            remoteVideo.onloadedmetadata = () => {
                remoteVideo.play();
                noSignal.classList.add('hidden');
            };
        });

        call.on('close', () => {
            console.log('Call closed by sender.');
            remoteVideo.srcObject = null;
            noSignal.classList.remove('hidden');
        });
        
        call.on('error', (err) => {
            console.error('Call error:', err);
            remoteVideo.srcObject = null;
            noSignal.classList.remove('hidden');
        });
    });

    // Fallback: If connection gets entirely dropped, ensure No Signal is shown
    peer.on('disconnected', () => {
        console.log('Peer disconnected from server, attempting reconnect...');
        remoteVideo.srcObject = null;
        noSignal.classList.remove('hidden');
        peer.reconnect();
    });
});
