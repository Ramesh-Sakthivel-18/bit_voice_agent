import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { getTranslation } from '../utils/translations';
import { isTakePhotoIntent } from '../utils/voiceMatcher';

export const CameraView = ({ onCapture, language = 'ta-IN' }) => {
    const videoRef = useRef(null);
    const [, setStream] = useState(null);
    const { registerVoiceHandler, unregisterVoiceHandler, speak } = useSmartVoice();
    const t = getTranslation(language);

    const takeSnapshot = useCallback(() => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoRef.current, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg');
            if (onCapture) {
                onCapture(base64);
            }
        }
    }, [onCapture]);

    useEffect(() => {
        let activeStream = null;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
            .then(s => {
                activeStream = s;
                setStream(s);
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                }
            })
            .catch(err => {
                console.error("Camera access error:", err);
            });

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Register voice command for hands-free photo taking
    useEffect(() => {
        const handleVoiceSnapshot = (rawText) => {
            if (!rawText) return;
            console.log("[CameraView Voice Command]:", rawText);
            if (isTakePhotoIntent(rawText)) {
                const msg = language === 'ta-IN' ? "புகைப்படம் எடுக்கப்படுகிறது..." : "Taking photo...";
                speak(msg, language);
                takeSnapshot();
            }
        };

        registerVoiceHandler(handleVoiceSnapshot);
        return () => {
            unregisterVoiceHandler();
        };
    }, [language, registerVoiceHandler, unregisterVoiceHandler, speak, takeSnapshot]);

    return (
        <div className="flex flex-col items-center w-full max-w-sm mx-auto">
            {/* Camera Video Card */}
            <div className="relative w-full rounded-3xl overflow-hidden shadow-xl border-4 border-blue-600 bg-black aspect-[4/5] max-h-[340px]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                />
                
                {/* Oval Face Guide Overlay */}
                <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
                    <div className="w-44 h-60 border-4 border-blue-400 border-dashed rounded-[50%] shadow-[0_0_20px_rgba(59,130,246,0.3)] animate-pulse"></div>
                </div>
            </div>

            {/* Prominent Action Button Clearly Separated & Positioned Below Preview */}
            <div className="mt-5 w-full flex flex-col items-center gap-2">
                <button
                    type="button"
                    onClick={takeSnapshot}
                    className="w-full py-4 px-6 rounded-2xl font-black text-xl md:text-2xl tracking-wide bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 active:scale-95 text-white shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer z-30"
                >
                    <span className="text-2xl">📸</span>
                    <span>{t.photoUI || (language === 'ta-IN' ? "புகைப்படம் எடுக்கவும்" : "TAKE PHOTO")}</span>
                </button>

                <p className="text-xs text-slate-600 font-bold mt-1 text-center">
                    {language === 'ta-IN' 
                        ? "👆 பொத்தானை அழுத்தவும் அல்லது கீழே மைக்கில் 'படம்' என்று சொல்லுங்கள்" 
                        : "👆 Tap button above or speak 'Take Photo' into the mic"}
                </p>
            </div>
        </div>
    );
};
