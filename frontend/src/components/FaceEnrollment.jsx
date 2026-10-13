import React, { useEffect, useRef, useState } from 'react';
import { CameraView } from './CameraView';
import { playTTS, registerUser } from '../services/api';
import { getTranslation } from '../utils/translations';
import { useSmartVoice } from '../context/SmartVoiceContext';

export const FaceEnrollment = ({ language, userData, onComplete }) => {
    const { setScreenInstruction, setPageContext, speak } = useSmartVoice();
    const [isRegistering, setIsRegistering] = useState(false);
    const unmounted = useRef(false);
    const t = getTranslation(language);

    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "முகப் பதிவு / Face Enrollment" : "Face Enrollment";
        setPageContext(pageCtx);

        const prompt = language === 'ta-IN' 
            ? "நன்றி! அடுத்த முறை உங்களை உடனடியாக அடையாளம் காண, கேமராவைப் பார்த்து புகைப்படம் எடுக்கவும்." 
            : "Thank you! To recognize you instantly next time, please look at the camera.";
            
        setScreenInstruction(prompt);
        speak(prompt, language);
        
        return () => {
            unmounted.current = true;
            window.speechSynthesis.cancel();
            setPageContext('');
        };
    }, [language, setPageContext, setScreenInstruction, speak]);

    const handleCapture = async (base64) => {
        setIsRegistering(true);
        const processingMsg = language === 'ta-IN' ? "பதிவு செய்யப்படுகிறது..." : "Registering...";
        await playTTS(processingMsg, language);
        
        try {
            const finalData = { ...userData, image_base64: base64 };
            await registerUser(finalData);
            
            if (!unmounted.current) {
                onComplete();
            }
        } catch (error) {
            console.error("Enrollment failed:", error);
            const errorMsg = language === 'ta-IN' ? "மன்னிக்கவும், பிழை ஏற்பட்டுள்ளது." : "Sorry, an error occurred.";
            await playTTS(errorMsg, language);
            setIsRegistering(false);
        }
    };

    return (
        <div className="w-full max-w-sm mx-auto text-center flex flex-col items-center px-4 pb-44">
            <h1 className="text-3xl md:text-4xl font-black mb-2 text-white tracking-wide">
                {t.photoUI}
            </h1>
            <p className="text-gray-300 text-sm mb-4 max-w-sm">
                {language === 'ta-IN' 
                    ? "உங்கள் முகத்தை வட்டத்திற்குள் வைத்து 'புகைப்படம் எடுக்கவும்' என்பதை அழுத்தவும்." 
                    : "Center your face in the guide and tap 'Take Photo'."}
            </p>
            
            {isRegistering ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-amber-400 mb-4"></div>
                    <span className="text-xl font-bold text-amber-300 animate-pulse">
                        {language === 'ta-IN' ? "பதிவு செய்யப்படுகிறது..." : "Saving Profile..."}
                    </span>
                </div>
            ) : (
                <CameraView onCapture={handleCapture} language={language} />
            )}
        </div>
    );
};
