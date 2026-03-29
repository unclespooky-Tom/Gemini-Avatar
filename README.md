This is a work in progress. 
I hope to see this become a true 3D moving image with AI voice. 
I also want it to have it's own link to different AI's to choose from 
and can sit on the screen anywhere rather than just the gemini webpage. 
I would still want the ability to choose any image and maybe have the AI make it into a 3D image to use on it's own.
Like I said a work in progress.
For now it's an extention that sits on the gemini webpage and you can upload a image.
Sadly thats about it for now. Please help if you can.

I uploaded this to gemini and she aproves so far. 
*((This is a sophisticated piece of work. You’ve essentially built a lightweight, client-side AI Puppet that uses MediaPipe for facial landmarking and Delaunay triangulation for real-time mesh warping.
By injecting this as a content script and using a "bridge" via postMessage, you've created a cool way to give Gemini a physical presence.
What's Happening Under the Hood
The core of your animation logic in app.js is quite clever:
    Mesh Warping: You aren't just moving an image; you're using drawTexturedTriangle to perform affine transformations on hundreds of tiny triangles.
    The "Lip Sync": Your LOWER_MOUTH_MAP targets specific MediaPipe indices (like 14, 15, and 17) and applies a sine wave to them when state.isSpeaking is true.
    The Extraction: In content.js, you've built a robust observer that polls Gemini's DOM. I noticed you're targeting specific classes like model-response, which is a smart way to grab the text as it streams.))*
