import React, { useEffect, useRef, useState } from 'react';
import { CameraView } from './CameraView';
import { playTTS, faceLogin } from '../services/api';

export const FaceLogin = ({ language, onComplete }) => {
    const [isVerifying, setIsVerifying] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const unmounted = useRef(false);

    useEffect(() => {
        const prompt = language === 'ta-IN'
            ? "பதிவு முடிந்தது! இப்போது உங்கள் முகத்தைப் பார்த்து உள்நுழையுங்கள்."
            : "Registration complete! Now look at the camera to log in.";
        
        playTTS(prompt, language);
        
        return () => {
            unmounted.current = true;
            window.speechSynthesis.cancel();
        };
    }, [language]);

    const handleCapture = async (base64) => {
        setIsVerifying(true);
        setLoginError(null);
        
        const processingMsg = language === 'ta-IN' ? "சரிபார்க்கிறது..." : "Verifying...";
        await playTTS(processingMsg, language);
        
        try {
            const response = await faceLogin(base64);
            
            if (!unmounted.current) {
                const user = response.user;
                const welcomeMsg = language === 'ta-IN' 
                    ? `வரவேற்கிறோம் ${user.name}! உள்நுழைவு வெற்றிகரமாக முடிந்தது.` 
                    : `Welcome ${user.name}! Login successful.`;
                
                await playTTS(welcomeMsg, language);
                
                if (!unmounted.current) {
                    onComplete(user);
                }
            }
        } catch (error) {
            console.error("Login failed:", error);
            if (!unmounted.current) {
                setLoginError(error.message);
                setIsVerifying(false);
                
                const errorMsg = language === 'ta-IN' ? "முகம் பொருந்தவில்லை. மீண்டும் முயற்சிக்கவும்." : "Face not recognized. Try again.";
                await playTTS(errorMsg, language);
            }
        }
    };

    return (
        <div className="w-full text-center flex flex-col items-center">
            <h1 className="text-4xl font-bold mb-4 text-white">
                {language === 'ta-IN' ? "உள்நுழைவு" : "Face Login"}
            </h1>
            
            {loginError && (
                <div className="mb-4 text-red-400 bg-red-900/30 px-6 py-2 rounded-full font-bold">
                    ⚠️ {loginError}
                </div>
            )}
            
            {isVerifying ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-24 w-24 border-b-8 border-green-500 mb-4"></div>
                    <span className="text-2xl text-green-400 animate-pulse">
                        {language === 'ta-IN' ? "சரிபார்க்கிறது..." : "Verifying Identity..."}
                    </span>
                </div>
            ) : (
                <CameraView onCapture={handleCapture} />
            )}
        </div>
    );
};
