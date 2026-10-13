import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LanguageSelect } from './components/LanguageSelect';
import { AuthActionSelect } from './components/AuthActionSelect';
import { RoleSelect } from './components/RoleSelect';
import { VoiceOnboarding } from './components/VoiceOnboarding';
import { FaceEnrollment } from './components/FaceEnrollment';
import { FaceLogin } from './components/FaceLogin';
import { BuyerDashboard } from './components/BuyerDashboard';
import { SellerDashboard } from './components/SellerDashboard';
import { SmartVoiceProvider } from './context/SmartVoiceContext';
import { SmartVoiceDock } from './components/SmartVoiceDock';

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    const [language, setLanguage] = useState(() => {
        return sessionStorage.getItem('appLanguage') || 'ta-IN';
    });
    
    const [userData, setUserData] = useState(() => {
        const saved = sessionStorage.getItem('appUserData');
        return saved ? JSON.parse(saved) : { 
            language: '', 
            role: '',
            name: '', 
            village: '', 
            phone: '', 
            image_base64: '' 
        };
    });
    
    const [loggedInUser, setLoggedInUser] = useState(() => {
        const saved = sessionStorage.getItem('appLoggedInUser');
        return saved ? JSON.parse(saved) : null;
    });

    // Sync to sessionStorage whenever these change
    useEffect(() => {
        sessionStorage.setItem('appLanguage', language);
        sessionStorage.setItem('appUserData', JSON.stringify(userData));
        if (loggedInUser) {
            sessionStorage.setItem('appLoggedInUser', JSON.stringify(loggedInUser));
        } else {
            sessionStorage.removeItem('appLoggedInUser');
        }
    }, [language, userData, loggedInUser]);

    const handleLanguageSelect = (langCode) => {
        setLanguage(langCode);
        setUserData(prev => ({ ...prev, language: langCode }));
        navigate('/action');
    };

    const handleActionSelect = (action) => {
        if (action === 'login') {
            navigate('/login');
        } else {
            navigate('/role');
        }
    };

    const handleRoleSelect = (role) => {
        setUserData(prev => ({ ...prev, role }));
        navigate('/onboarding');
    };

    const handleOnboardingComplete = (extractedData) => {
        setUserData(prev => ({ ...prev, ...extractedData }));
        navigate('/enrollment');
    };

    const handleEnrollmentComplete = () => {
        // Backend save already happened inside FaceEnrollment
        navigate('/login');
    };

    const handleLoginComplete = (user) => {
        setLoggedInUser(user);
        sessionStorage.setItem('loggedInUser', JSON.stringify(user));
        if (user.role === 'seller' || user.role === 'விற்பனையாளர்') {
            navigate('/seller-dashboard');
        } else {
            navigate('/buyer-dashboard');
        }
    };

    return (
        <SmartVoiceProvider language={language}>
            <div className={`min-h-screen w-full flex flex-col items-center ${location.pathname !== '/' ? 'justify-start bg-[#0A192F] text-white p-4 pt-6 md:pt-10 pb-36 overflow-y-auto' : 'justify-center'}`}>
                
                <Routes>
                    <Route path="/" element={<LanguageSelect onSelect={handleLanguageSelect} />} />
                    
                    <Route path="/action" element={<AuthActionSelect language={language} onSelect={handleActionSelect} />} />
                    <Route path="/role" element={<RoleSelect language={language} onSelect={handleRoleSelect} />} />
                    
                    <Route path="/onboarding" element={
                        <VoiceOnboarding 
                            language={language} 
                            userData={userData} 
                            onComplete={handleOnboardingComplete} 
                        />
                    } />
                    
                    <Route path="/enrollment" element={
                        <FaceEnrollment 
                            language={language} 
                            userData={userData} 
                            onComplete={handleEnrollmentComplete} 
                        />
                    } />
                    
                    <Route path="/login" element={
                        <FaceLogin 
                            language={language} 
                            onComplete={handleLoginComplete} 
                        />
                    } />
                    
                    <Route path="/buyer-dashboard" element={
                        loggedInUser ? <BuyerDashboard language={language} user={loggedInUser} /> : <Navigate to="/login" replace />
                    } />

                    <Route path="/seller-dashboard" element={
                        loggedInUser ? <SellerDashboard language={language} user={loggedInUser} /> : <Navigate to="/login" replace />
                    } />

                    {/* Fallback route */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                
                {/* Fixed prominent bottom-center microphone box across all screens */}
                {location.pathname !== '/' && <SmartVoiceDock />}
            </div>
        </SmartVoiceProvider>
    );
}

export default App;
