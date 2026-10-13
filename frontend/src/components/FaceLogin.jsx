import React, { useEffect, useRef, useState } from 'react';
import { CameraView } from './CameraView';
import { playTTS, faceLogin } from '../services/api';
import { useSmartVoice } from '../context/SmartVoiceContext';

export const FaceLogin = ({ language, onComplete }) => {
    const { setScreenInstruction, setPageContext, speak } = useSmartVoice();
    const [isVerifying, setIsVerifying] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const unmounted = useRef(false);

    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "முக அங்கீகாரம் / Face Login" : "Face Login";
        setPageContext(pageCtx);

        const prompt = language === 'ta-IN'
            ? "கேமராவைப் பாருங்கள். முகத்தை அடையாளம் கண்டு உள்நுழைகிறோம்."
            : "Look directly at the camera. We are recognizing your face to log in.";
        
        setScreenInstruction(prompt);
        speak(prompt, language);
        
        return () => {
            unmounted.current = true;
            window.speechSynthesis.cancel();
            setPageContext('');
        };
    }, [language, setPageContext, setScreenInstruction, speak]);

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
        <div className="w-full max-w-sm mx-auto text-center flex flex-col items-center px-4 pb-44">
            <h1 className="text-3xl md:text-4xl font-black mb-3 text-white tracking-wide">
                {language === 'ta-IN' ? "உள்நுழைவு" : "Face Login"}
            </h1>
            <p className="text-gray-300 text-sm mb-4">
                {language === 'ta-IN' 
                    ? "கேமராவைப் பார்த்து 'புகைப்படம் எடுக்கவும்' என்பதை அழுத்தவும்" 
                    : "Look at the camera and tap 'Take Photo'"}
            </p>
            
            {loginError && (
                <div className="mb-4 text-red-300 bg-red-900/50 border border-red-500/50 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-lg">
                    ⚠️ {loginError}
                </div>
            )}
            
            {isVerifying ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-amber-400 mb-4"></div>
                    <span className="text-xl font-bold text-amber-300 animate-pulse">
                        {language === 'ta-IN' ? "சரிபார்க்கிறது..." : "Verifying Identity..."}
                    </span>
                </div>
            ) : (
                <CameraView onCapture={handleCapture} language={language} />
            )}
        </div>
    );
};
