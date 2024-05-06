import './style.css';


import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc,setDoc, getDoc , onSnapshot} from 'firebase/firestore';



const firebaseConfig = {
  apiKey: "AIzaSyCyc7EJtPZB0q-JOwxg0dHuyXk-BoBhxgg",
  authDomain: "video-chat-e85c6.firebaseapp.com",
  projectId: "video-chat-e85c6",
  storageBucket: "video-chat-e85c6.appspot.com",
  messagingSenderId: "857109306541",
  appId: "1:857109306541:web:88a374afea0dd953cd3a24",
  measurementId: "G-4PPDKGME76"
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

console.log(firestore)
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = doc(collection(firestore, 'calls'));
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      await addDoc(offerCandidates, event.candidate.toJSON());
    }
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  await setDoc(callDoc, { offer });

  // Listen for remote answer
  // callDoc.onSnapshot((snapshot) => {
  //   const data = snapshot.data();
  //   if (!pc.currentRemoteDescription && data?.answer) {
  //     const answerDescription = new RTCSessionDescription(data.answer);
  //     pc.setRemoteDescription(answerDescription);
  //   }
  // });

  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  // answerCandidates.onSnapshot((snapshot) => {
  //   snapshot.docChanges().forEach((change) => {
  //     if (change.type === 'added') {
  //       const candidate = new RTCIceCandidate(change.doc.data());
  //       pc.addIceCandidate(candidate);
  //     }
  //   });
  // });

  onSnapshot(answerCandidates, (snapshot) => {
    const changes = snapshot.docChanges();
    changes.forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(firestore, 'calls', callId);
  const answerCandidates = collection(callDoc, 'answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates');

  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      await addDoc(answerCandidates, event.candidate.toJSON());
    }
  };

  const callData = (await getDoc(callDoc)).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await setDoc(callDoc, { answer });

  // offerCandidates.onSnapshot((snapshot) => {
  //   snapshot.docChanges().forEach((change) => {
  //     console.log(change);
  //     if (change.type === 'added') {
  //       let data = change.doc.data();
  //       pc.addIceCandidate(new RTCIceCandidate(data));
  //     }
  //   });
  // });

  onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};