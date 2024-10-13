document.addEventListener('DOMContentLoaded', function() {
  const summarizeBtn = document.getElementById('summarizeBtn');
  const summaryDiv = document.getElementById('summary');
  const loadingDiv = document.getElementById('loading');

  let currentTabId;

  // Helper function to use chrome.storage.local if available, otherwise use localStorage
  const storage = {
    get: function(key, callback) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(key, callback);
      } else {
        const result = {};
        result[key] = localStorage.getItem(key);
        callback(result);
      }
    },
    set: function(obj, callback) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, callback);
      } else {
        const key = Object.keys(obj)[0];
        localStorage.setItem(key, obj[key]);
        if (callback) callback();
      }
    }
  };

  // Load saved summary when popup opens
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    currentTabId = tabs[0].id;
    loadSavedSummary(currentTabId);
  });

  summarizeBtn.addEventListener('click', function() {
    storage.get(currentTabId.toString(), function(result) {
      if (result[currentTabId]) {
        // If summary exists, just display it
        summaryDiv.textContent = result[currentTabId];
      } else {
        // If no summary exists, start the summarization process
        startSummarization();
      }
    });
  });

  function loadSavedSummary(tabId) {
    storage.get(tabId.toString(), function(result) {
      if (result[tabId]) {
        summaryDiv.textContent = result[tabId];
        summarizeBtn.textContent = "Re-summarize";
      } else {
        summaryDiv.textContent = "No summary available. Click 'Summarize' to generate one.";
        summarizeBtn.textContent = "Summarize";
      }
    });
  }

  function startSummarization() {
    summaryDiv.textContent = '';
    loadingDiv.style.display = 'block';
    summarizeBtn.disabled = true;

    chrome.tabs.sendMessage(currentTabId, {action: "summarize"}, function(response) {
      if (response && response.content) {
        summarizeText(response.content, currentTabId);
      } else {
        handleError("Couldn't retrieve page content.");
      }
    });
  }

  async function summarizeText(text, tabId) {
    const API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn";
    const API_TOKEN = "YOUR_HUGGING_FACE_API_TOKEN"; // Replace with your actual token

    const chunks = splitTextIntoChunks(text, 750);
    let fullSummary = '';

    for (let chunk of chunks) {
      try {
        const chunkSummary = await retryOperation(() => summarizeChunk(chunk, API_URL, API_TOKEN), 3);
        fullSummary += chunkSummary + ' ';
      } catch (error) {
        console.error("Error summarizing chunk after retries:", error);
      }
    }

    if (fullSummary) {
      fullSummary = fullSummary.trim();
      summaryDiv.textContent = fullSummary;
      // Save the summary for this tab
      storage.set({[tabId]: fullSummary}, function() {
        console.log('Summary saved for tab:', tabId);
      });
      summarizeBtn.textContent = "Re-summarize";
    } else {
      handleError("Failed to generate summary after multiple attempts.");
    }

    loadingDiv.style.display = 'none';
    summarizeBtn.disabled = false;
  }

  async function summarizeChunk(text, API_URL, API_TOKEN) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          max_length: Math.min(150, Math.max(50, Math.floor(text.split(' ').length * 0.2))),
          min_length: Math.min(50, Math.floor(text.split(' ').length * 0.1))
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result[0].summary_text;
  }

  async function retryOperation(operation, maxRetries) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        console.log(`Attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }

  function splitTextIntoChunks(text, wordsPerChunk) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks;
  }

  function handleError(message) {
    summaryDiv.textContent = `Error: ${message}\n\nPlease try again later.`;
    loadingDiv.style.display = 'none';
    summarizeBtn.disabled = false;
  }
});
