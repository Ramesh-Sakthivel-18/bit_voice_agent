import { useState, useRef, useCallback } from 'react';

const SILENCE_THRESHOLD = 10; // Volume threshold
const SILENCE_DURATION = 2000; // 2.0 seconds

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorder = useRef(null);
    const audioChunks = useRef([]);
    const audioContext = useRef(null);
    const analyser = useRef(null);
    const silenceTimer = useRef(null);
    const resolvePromise = useRef(null);

    const checkSilence = useCallback(() => {
        if (!analyser.current) return;
        
        const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
        analyser.current.getByteFrequencyData(dataArray);
        
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length;
        
        if (average < SILENCE_THRESHOLD) {
            if (!silenceTimer.current) {
                silenceTimer.current = setTimeout(() => {
                    stopRecording();
                }, SILENCE_DURATION);
            }
        } else {
            if (silenceTimer.current) {
                clearTimeout(silenceTimer.current);
                silenceTimer.current = null;
            }
        }
        
        // requestAnimationFrame will be called as long as we are recording
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
            requestAnimationFrame(checkSilence);
        }
    }, []);

    const startRecording = useCallback(() => {
        return new Promise((resolve, reject) => {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    resolvePromise.current = resolve;
                    mediaRecorder.current = new MediaRecorder(stream);
                    audioChunks.current = [];

                    // Setup AudioContext for VAD
                    audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.current.createMediaStreamSource(stream);
                    analyser.current = audioContext.current.createAnalyser();
                    source.connect(analyser.current);

                    mediaRecorder.current.ondataavailable = e => {
                        audioChunks.current.push(e.data);
                    };

                    mediaRecorder.current.onstop = () => {
                        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
                        if (resolvePromise.current) {
                            resolvePromise.current(audioBlob);
                            resolvePromise.current = null;
                        }
                        stream.getTracks().forEach(track => track.stop());
                        if (audioContext.current) {
                            audioContext.current.close();
                        }
                    };

                    mediaRecorder.current.start();
                    setIsRecording(true);
                    
                    // Start checking for silence
                    requestAnimationFrame(checkSilence);
                })
                .catch(reject);
        });
    }, [checkSilence]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
            setIsRecording(false);
            if (silenceTimer.current) {
                clearTimeout(silenceTimer.current);
                silenceTimer.current = null;
            }
        }
    }, []);

    return { isRecording, startRecording, stopRecording };
};
