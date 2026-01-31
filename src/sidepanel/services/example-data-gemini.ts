const exampleDataGemini = {
  "chapters": [
    {
      "startTime": "00:00",
      "endTime": "04:51",
      "title": "Transistors and the Wavelength Limit",
      "description": "Microchips are composed of billions of transistors that serve as fundamental electronic switches. For decades, Moore's Law successfully predicted the doubling of transistor density every two years. However, progress faced a physical barrier as chip features shrank toward the wavelength of the light used to etch them. Traditional Deep Ultraviolet (DUV) lithography used 193nm light, which hit a resolution limit that prevented further miniaturization without extreme complexity."
    },
    {
      "startTime": "04:51",
      "endTime": "07:11",
      "title": "The Photolithography Equation",
      "description": "The resolution of a lithography system is governed by the Rayleigh equation, where the smallest feature size is proportional to the wavelength of light divided by the numerical aperture (NA). To create smaller circuits, engineers must either find shorter wavelengths or increase the system's NA. This led to the pursuit of Extreme Ultraviolet (EUV) light, which has a wavelength of just 13.5nm—more than ten times shorter than previous standards."
    },
    {
      "startTime": "07:11",
      "endTime": "14:15",
      "title": "The Impossible Challenge of EUV",
      "description": "Transitioning to EUV was long considered impossible because EUV light is absorbed by almost all materials, including air and glass. This necessitated a system that operates in a near-perfect vacuum and uses mirrors instead of lenses. Conventional mirrors do not reflect EUV light at normal incidence; instead, it passes through them or is absorbed. Researchers had to develop specialized multilayer Bragg reflectors consisting of alternating layers of silicon and molybdenum to successfully bounce EUV light."
    },
    {
      "startTime": "14:15",
      "endTime": "18:46",
      "title": "Multilayer Mirrors and Atomic Smoothness",
      "description": "The mirrors used in EUV machines are some of the flattest objects ever manufactured by humans. Produced by Zeiss, these optics must be smooth at the atomic level to prevent phase errors. If one of these mirrors were expanded to the size of Germany, the largest bump on its surface would be less than one millimeter tall. This precision is required because even a tiny deviation can scatter the 13.5nm light and ruin the chip pattern."
    },
    {
      "startTime": "18:46",
      "endTime": "22:01",
      "title": "Hiroo Kinoshita and Early Skepticism",
      "description": "In the 1980s, Japanese researcher Hiroo Kinoshita demonstrated the first successful EUV imaging, but he faced massive skepticism from the industry. Many experts believed that generating a powerful enough EUV source for commercial manufacturing was a 'big fish story.' Despite the doubts, his work laid the foundation for soft X-ray projection lithography, which eventually evolved into modern EUV technology."
    },
    {
      "startTime": "22:01",
      "endTime": "25:53",
      "title": "The EUV LLC Consortium and National Labs",
      "description": "To overcome the staggering costs and engineering hurdles, a unique public-private partnership called the EUV LLC was formed. It brought together industry rivals like Intel, Motorola, and AMD with US National Laboratories like Lawrence Livermore and Sandia. This consortium shared the risk of developing a prototype machine, proving that EUV could move from a laboratory curiosity to a viable industrial tool."
    },
    {
      "startTime": "25:53",
      "endTime": "33:40",
      "title": "Generating Power: The Tin Droplet Problem",
      "description": "The EUV light source is one of the machine's most complex components. It works by shooting microscopic tin droplets, approximately 30 microns wide, with a high-power CO2 laser twice. The first pulse flattens the droplet into a 'pancake' shape to increase its surface area, and the second pulse vaporizes it into a plasma. This process occurs 50,000 times per second, generating 250 watts of EUV power. This breakthrough, developed by Cymer, solved the problem of low manufacturing throughput."
    },
    {
      "startTime": "33:40",
      "endTime": "41:01",
      "title": "Precision Manufacturing and High NA",
      "description": "ASML's machines move silicon wafers and patterns (reticles) at accelerations exceeding 20g with nanometer precision. The newest generation of machines, known as High NA, increases the numerical aperture from 0.33 to 0.55. This improvement allows for the etching of features as small as 8nm, enabling the creation of more powerful and energy-efficient processors for AI and mobile devices."
    },
    {
      "startTime": "41:01",
      "endTime": "45:59",
      "title": "ASML’s Global Impact and the Future",
      "description": "ASML has become the sole provider of EUV machines, which cost approximately $400 million each and are essential for the world's most advanced chip fabs. The success of the machine is a testament to 'unreasonable' persistence against physical limits. Future advancements will continue to scale from the micro to the nano and pico levels, driven by the ongoing demand for greater computing power."
    }
  ],
  "overallSummary": "EUV lithography machines are arguably the most sophisticated tools ever built, representing a multi-decade triumph of engineering over physics. The video details how ASML and its partners overcame the 'wavelength wall' by utilizing 13.5nm Extreme Ultraviolet light, which behaves so uniquely it requires a complete vacuum and mirrors polished to atomic-level smoothness. It highlights the critical roles of global collaboration—from Hiroo Kinoshita's early proofs to the US National Labs' consortium and Cymer's laser-blasted tin droplet source. By successfully scaling this technology to high-volume manufacturing, ASML has enabled the continued growth of semiconductor performance, cementing its position as the critical gatekeeper for all modern high-performance computing."
}