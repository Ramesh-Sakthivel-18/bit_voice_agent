import React, { useRef, useEffect, useState } from 'react';

export const CameraView = ({ onCapture }) => {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);

    useEffect(() => {
        let activeStream = null;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(s => {
                activeStream = s;
                setStream(s);
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                }
            })
            .catch(console.error);

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const takeSnapshot = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoRef.current, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg');
            onCapture(base64);
        }
    };

    return (
        <div className="relative w-full max-w-sm mx-auto mt-4 rounded-3xl overflow-hidden shadow-2xl border-4 border-brightYellow bg-black">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-[400px] object-cover scale-x-[-1]"
            />
            {/* Overlay Guide Circle */}
            <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
                <div className="w-56 h-72 border-4 border-white/50 border-dashed rounded-[50%]"></div>
            </div>
            
            <button
                onClick={takeSnapshot}
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-brightYellow text-darkNavy px-8 py-3 rounded-full font-bold text-xl shadow-lg active:scale-95"
            >
                TAKE PHOTO
            </button>
        </div>
    );
};
