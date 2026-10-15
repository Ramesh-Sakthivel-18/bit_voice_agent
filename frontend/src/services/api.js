const API_BASE_URL = "http://localhost:8000/api";

export const transcribeAudio = async (audioBlob, language) => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  
  // Groq Whisper only accepts 2-letter ISO-639-1 codes (e.g., 'ta', 'hi')
  // but the frontend uses BCP-47 (e.g., 'ta-IN'). We must split and use the first part.
  const whisperLang = language ? language.split('-')[0] : 'hi';
  formData.append("language", whisperLang);

  const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error("Transcription failed");
  return response.json();
};

export const parseIntent = async (transcript, expectedEntity) => {
  const response = await fetch(`${API_BASE_URL}/voice/parse-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, expected_entity: expectedEntity }),
  });
  if (!response.ok) throw new Error("Intent parsing failed");
  return response.json();
};

export const registerUser = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
  }
  return response.json();
};

export const faceLogin = async (imageBase64) => {
  const response = await fetch(`${API_BASE_URL}/auth/face-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  if (!response.ok) {
      let errorMessage = "Face did not match any registered users.";
      try {
          const error = await response.json();
          if (error.detail) {
              if (typeof error.detail === 'string') {
                  errorMessage = error.detail;
              } else if (error.detail.message) {
                  errorMessage = error.detail.message;
              }
          }
      } catch (e) {
          // Fallback if not valid json
      }
      throw new Error(errorMessage);
  }
  return response.json();
};

export const playTTS = async (text, lang) => {
  // Try browser TTS first
  if ('speechSynthesis' in window) {
      return new Promise((resolve) => {
          const utterance = new SpeechSynthesisUtterance(text);
          // Pass the exact BCP-47 lang code (ta-IN, hi-IN, en-US) so the browser uses the native voice
          utterance.lang = lang || 'en-US'; 
          utterance.rate = 0.9; // Slightly slower for clarity
          utterance.onend = resolve;
          utterance.onerror = resolve; // Resolve on error to avoid blocking
          window.speechSynthesis.speak(utterance);
      });
  } else {
      // Fallback to backend
      const response = await fetch(`${API_BASE_URL}/voice/tts?text=${encodeURIComponent(text)}&lang=${lang}`);
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      return new Promise(resolve => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play();
      });
  }
};

export const validateCommerceStep = async (step, transcript, language) => {
  const response = await fetch(`${API_BASE_URL}/commerce/validate-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, transcript, language }),
  });
  if (!response.ok) throw new Error("Validation API failed");
  return response.json();
};

export const saveSellerListing = async (listingData) => {
  const response = await fetch(`${API_BASE_URL}/commerce/seller/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(listingData),
  });
  if (!response.ok) throw new Error("Saving listing failed");
  return response.json();
};

export const searchBuyerListings = async (transcript, language) => {
    const res = await fetch(`${API_BASE_URL}/commerce/buyer/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_transcript: transcript, language: language })
    });
    
    if (!res.ok) {
        throw new Error('Search failed');
    }
    return res.json();
};

export const getAllBuyerListings = async (language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/buyer/all-listings?language=${encodeURIComponent(language)}`);
    if (!res.ok) {
        throw new Error('Failed to fetch all listings');
    }
    return res.json();
};


export const expressBuyerInterest = async (buyerId, listingId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, listing_id: listingId, language })
    });
    if (!res.ok) throw new Error('Expressing interest failed');
    return res.json();
};

export const getSellerPendingOrders = async (sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/orders/seller/pending/${sellerId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch pending orders");
    return res.json();
};

export const acceptSellerOrder = async (orderId, sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, seller_id: sellerId, language })
    });
    if (!res.ok) throw new Error("Failed to accept order");
    return res.json();
};

export const getBuyerOrderDetails = async (orderId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/${orderId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch order details");
    return res.json();
};

export const getBuyerActiveOrders = async (buyerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/orders/buyer/active/${buyerId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch active buyer orders");
    return res.json();
};

export const payOrder = async (orderId, buyerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, buyer_id: buyerId, language })
    });
    if (!res.ok) throw new Error("Payment processing failed");
    return res.json();
};

export const getSellerConfirmedOrders = async (sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/orders/seller/confirmed/${sellerId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch confirmed orders");
    return res.json();
};

export const scheduleOrderPickup = async (orderId, sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/schedule-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, seller_id: sellerId, language })
    });
    if (!res.ok) throw new Error("Failed to schedule pickup");
    return res.json();
};

export const createDirectOrder = async (buyerId, listingId, quantity = 1, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_id: buyerId, listing_id: listingId, quantity, language })
    });
    if (!res.ok) throw new Error("Creating direct order failed");
    return res.json();
};

export const packOrder = async (orderId, sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, seller_id: sellerId, language })
    });
    if (!res.ok) throw new Error("Failed to pack order");
    return res.json();
};

export const dispatchOrder = async (orderId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, language })
    });
    if (!res.ok) throw new Error("Failed to dispatch order");
    return res.json();
};

export const confirmOrderReceived = async (orderId, userId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/order/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, user_id: userId, language })
    });
    if (!res.ok) throw new Error("Failed to confirm order received");
    return res.json();
};

export const getBuyerOrderHistory = async (buyerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/orders/buyer/history/${buyerId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch buyer order history");
    return res.json();
};

export const getSellerOrderHistory = async (sellerId, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/orders/seller/history/${sellerId}?language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch seller order history");
    return res.json();
};

export const getScreenInstruction = async (screen, language = 'ta-IN') => {
    const res = await fetch(`${API_BASE_URL}/commerce/screen-instruction?screen=${encodeURIComponent(screen)}&language=${encodeURIComponent(language)}`);
    if (!res.ok) throw new Error("Failed to fetch screen instruction");
    return res.json();
};

export const getSellerListings = async (sellerId) => {
  const response = await fetch(`${API_BASE_URL}/commerce/seller/listings/${sellerId}`);
  if (!response.ok) throw new Error("Failed to fetch listings");
  return response.json();
};

export const askMarketAssistant = async (query, language = 'ta-IN', userRole = 'buyer') => {
  const response = await fetch(`${API_BASE_URL}/market/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language, user_role: userRole })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Market assistant request failed");
  }
  return response.json();
};
