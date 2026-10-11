import React from 'react';

export const MicrophoneButton = ({ isRecording, onStart, onStop }) => {
    return (
        <div className="flex justify-center items-center h-48 w-full mt-10">
            <button
                onPointerDown={onStart} // Tap-to-talk
                onPointerUp={onStop}   // Release to stop (or auto-stop via VAD)
                onPointerLeave={onStop} // Stop if dragged outside
                className={`
                    w-40 h-40 rounded-full flex justify-center items-center shadow-lg transition-all duration-300
                    ${isRecording ? 'bg-red-500 scale-110 mic-active' : 'bg-brightYellow'}
                `}
                style={{ touchAction: 'none' }} // Prevent scrolling while holding
            >
                {/* SVG Mic Icon inside */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-16 w-16 ${isRecording ? 'text-white' : 'text-darkNavy'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                </svg>
            </button>
        </div>
    );
};
