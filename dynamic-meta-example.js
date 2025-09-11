// Example: Dynamic meta tags for user profiles
// This would go in your server.js for profile routes

// For URLs like scottgpt.com/john-doe
app.get('/:slug([a-z0-9-]+)', async (req, res) => {
  const { slug } = req.params;
  
  try {
    // Get user profile data
    const profile = await getUserProfileBySlug(slug);
    
    if (profile) {
      // Generate dynamic HTML with user-specific meta tags
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${profile.display_name} - ScottGPT Interactive Resume</title>
  <meta name="description" content="Ask questions about ${profile.display_name}'s professional experience and get AI-powered responses." />
  
  <!-- Open Graph -->
  <meta property="og:title" content="${profile.display_name} - Interactive AI Resume" />
  <meta property="og:description" content="Ask questions about ${profile.display_name}'s professional experience and get AI-powered responses." />
  <meta property="og:image" content="https://scottgpt.com/profiles/${slug}/card.png" />
  
  <!-- Twitter -->
  <meta name="twitter:title" content="${profile.display_name} - Interactive AI Resume" />
  <meta name="twitter:description" content="Ask questions about ${profile.display_name}'s professional experience and get AI-powered responses." />
  <meta name="twitter:image" content="https://scottgpt.com/profiles/${slug}/card.png" />
</head>
<body>
  <div id="root"></div>
  <script src="/static/js/bundle.js"></script>
</body>
</html>`;
      
      res.send(html);
    } else {
      // Serve default React app
      res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
    }
  } catch (error) {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  }
});