function extractMainContent() {
  // List of tags to exclude
  const excludeTags = ['script', 'style', 'noscript', 'header', 'footer', 'nav', 'aside'];
  
  // Function to check if an element should be excluded
  const shouldExclude = (element) => {
    return excludeTags.includes(element.tagName.toLowerCase()) ||
           element.classList.contains('nav') ||
           element.classList.contains('menu') ||
           element.classList.contains('sidebar') ||
           element.classList.contains('footer');
  };

  // Recursive function to extract text
  function extractText(element) {
    if (shouldExclude(element)) return '';

    let text = '';
    for (let child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent.trim() + ' ';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        text += extractText(child);
      }
    }
    return text;
  }

  // Start extraction from the body
  return extractText(document.body).trim();
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "summarize") {
    const content = extractMainContent();
    sendResponse({content: content});
  }
  return true; // This line is important for asynchronous response
});
