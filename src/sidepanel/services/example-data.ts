/**
 * Example video analysis data for demonstration and fallback purposes.
 */

import { StreamingProcessingResult } from "./types";

export const exampleData: StreamingProcessingResult = {
  success: true,
  totalTime: "16.1s",
  videoInfo: {
    url: "https://www.youtube.com/watch?v=P_fHJIYENdI",
    title: "AlphaFold - The Most Useful Thing AI Has Ever Done",
    thumbnail: "https://img.youtube.com/vi/P_fHJIYENdI/maxresdefault.jpg",
    author: "Veritasium",
    duration: "00:24:52",
    upload_date: "Feb 10, 2025",
    view_count: 9496071,
    like_count: 303014,
  },
  transcript: "What if, all of the world's biggest problems from climate change, to curing diseases, to disposal of plastic waste, what if they all had the same solution? A solution so tiny it would be invisible. I'm inclined to believe this is possible, thanks to a recent breakthrough that solved one of the biggest problems of the last century. How to determine the structure of a protein? - It's been described to me as equivalent to Fermat's last theorem, but for biology. - Over six decades, tens of thousands[truncated for example]",
  analysis: {
  "title": "The AI Revolution in Protein Folding and Beyond",
  "summary": "The video explores the groundbreaking advancements in protein structure prediction, primarily driven by artificial intelligence. It details the historical challenges of determining protein structures, from early X-ray crystallography methods that took years to resolve a single protein, to the computational approaches that emerged. A significant portion focuses on DeepMind's AlphaFold, an AI system that dramatically accelerated protein structure prediction, achieving accuracy comparable to experimental methods. The narrative highlights the evolution of AlphaFold from its first iteration to AlphaFold 2, emphasizing the role of advanced AI algorithms, particularly the transformer architecture and the EvoFormer. The video also discusses the work of David Baker, who used generative AI to design novel proteins from scratch, opening up possibilities for new vaccines, therapies, and materials. The broader implications of these AI-driven scientific breakthroughs are explored, suggesting their potential to solve major global challenges like climate change, disease, and waste disposal by enabling rapid discovery and iteration in fields like materials science and biochemistry.",
  "takeaways": [
    "AI has revolutionized protein structure prediction, significantly accelerating scientific discovery in biology and related fields.",
    "The ability to accurately predict and design protein structures has vast implications for medicine, including vaccine development, disease treatment, and the creation of new therapies.",
    "Generative AI can design entirely new proteins with specific functions, offering solutions for challenges like venom neutralization, greenhouse gas capture, and plastic degradation.",
    "AI-driven scientific breakthroughs, exemplified by AlphaFold and RF Diffusion, represent a 'step function change' in the pace of research, enabling discoveries previously thought impossible.",
    "The methodologies developed for protein folding are transferable to other scientific domains, such as materials science, leading to the discovery of new stable materials."
  ],
  "chapters": [
    {
      "header": "The Protein Folding Problem: A Historical Challenge",
      "summary": "Proteins, fundamental to life, begin as amino acid strings that fold into complex 3D structures, which dictate their function. Determining these structures was historically a monumental challenge. Early methods, like X-ray crystallography, were time-consuming and expensive; John Kendrew's pioneering work on myoglobin took 12 years. The complexity of protein folding, with an astronomical number of possible configurations, made computational prediction seem impossible, as illustrated by Levinthal's paradox. This led to the establishment of the CASP competition in 1994 to foster computational solutions.",
      "key_points": [
        "Proteins are strings of amino acids that fold into specific 3D shapes, crucial for their function.",
        "Early protein structure determination relied on X-ray crystallography, a slow and costly process.",
        "John Kendrew spent 12 years to determine the first protein structure, myoglobin.",
        "Levinthal's paradox highlighted the immense computational difficulty of predicting protein folding, with a short protein having an astronomical number of possible configurations.",
        "The CASP competition was initiated in 1994 to encourage the development of computational models for protein structure prediction."
      ]
    },
    {
      "header": "Early Computational Approaches and Crowdsourcing",
      "summary": "Initial computational efforts to predict protein structures, such as the Rosetta algorithm, struggled to achieve high accuracy in the CASP competition. David Baker, a key figure in this field, innovated by pooling computing power from idle computers through 'Rosetta at Home.' Recognizing the human intuition for spatial puzzles, Baker then developed 'Fold It,' a video game that allowed human players to manipulate protein structures. This crowdsourcing approach proved remarkably successful, with gamers deciphering an HIV-related enzyme structure that was later confirmed experimentally, demonstrating the potential of collective intelligence in scientific discovery.",
      "key_points": [
        "Early computational algorithms like Rosetta faced challenges in accurately predicting protein structures.",
        "David Baker utilized distributed computing with 'Rosetta at Home' to increase computational power.",
        "The 'Fold It' video game leveraged human intuition for spatial puzzles to solve protein folding problems.",
        "Gamers successfully deciphered the structure of an HIV-related enzyme, which was confirmed by X-ray crystallography.",
        "The success of 'Fold It' highlighted the value of crowdsourcing and human pattern recognition in scientific research."
      ]
    },
    {
      "header": "AlphaFold's Breakthrough: AI Revolutionizes Prediction",
      "summary": "Demis Hassabis, inspired by his experience with Fold It, initiated DeepMind's AlphaFold project to tackle the protein folding problem using AI. AlphaFold 1, a deep neural network, used amino acid sequences and evolutionary information (co-evolution) as input to predict a 2D pair representation of the protein structure. This initial version showed promise at CASP 13 but did not meet the 90-point accuracy threshold. AlphaFold 2, under John Jumper's leadership, significantly improved accuracy by integrating advanced AI algorithms, particularly the transformer architecture (EvoFormer), and leveraging Google's immense computing power. The EvoFormer's two-tower design (biology and geometry) and iterative information exchange refined predictions, leading to a major breakthrough.",
      "key_points": [
        "DeepMind's AlphaFold project, led by Demis Hassabis, aimed to solve protein folding using AI.",
        "AlphaFold 1 used deep neural networks, amino acid sequences, and evolutionary data to predict 2D protein representations.",
        "AlphaFold 2, led by John Jumper, achieved a significant accuracy boost through advanced AI algorithms and Google's computing resources.",
        "The EvoFormer, a transformer-based architecture, was central to AlphaFold 2's success, processing both evolutionary and geometric information.",
        "AlphaFold 2's iterative refinement process, including triangular attention and a structure module, enabled highly accurate 3D protein predictions."
      ]
    },
    {
      "header": "Impact and Future of AI in Protein Science",
      "summary": "AlphaFold 2's success at CASP 14, achieving near-perfect accuracy, marked a pivotal moment, effectively solving the long-standing protein folding problem. This breakthrough has rapidly advanced biological research, contributing to malaria vaccine development, combating antibiotic resistance, and understanding disease mechanisms. John Jumper and Demis Hassabis were awarded the Nobel Prize for their work on AlphaFold. Concurrently, David Baker's 'RF Diffusion' uses generative AI to design entirely new proteins from scratch, akin to image generation AI. This capability has led to the creation of human-compatible antibodies for snake venom neutralization and holds promise for designing proteins for vaccines, cancer therapies, autoimmune diseases, and environmental solutions like capturing greenhouse gases and breaking down plastics. The rapid iteration enabled by 'Cowboy Biochemistry' signifies a new era of accelerated scientific discovery.",
      "key_points": [
        "AlphaFold 2's high accuracy at CASP 14 effectively solved the protein folding problem.",
        "The breakthrough has accelerated research in vaccine development, antibiotic resistance, and disease understanding.",
        "John Jumper and Demis Hassabis received the Nobel Prize for AlphaFold's contributions.",
        "David Baker's 'RF Diffusion' uses generative AI to design novel proteins with specific functions.",
        "Designed proteins have applications in anti-venom, vaccines, cancer, autoimmune diseases, and environmental solutions.",
        "The rapid design and testing of proteins, termed 'Cowboy Biochemistry,' signifies a new pace of scientific discovery."
      ]
    },
    {
      "header": "Broader Implications of AI in Scientific Discovery",
      "summary": "The success of AI in protein science, particularly with AlphaFold and RF Diffusion, serves as a powerful indicator of its transformative potential across various scientific disciplines. AI's ability to accelerate discovery by orders of magnitude, as seen in protein folding, suggests it can unlock fundamental problems that have historically hindered human progress. For instance, DeepMind's GNoME program has already discovered millions of new crystals, including stable materials with potential applications in superconductors and batteries. This demonstrates that AI is not merely providing incremental improvements but enabling 'step function changes' in scientific understanding and technological development, opening up previously impossible opportunities for addressing global challenges.",
      "key_points": [
        "AI's success in protein science indicates its broad applicability across scientific fields.",
        "AI can accelerate scientific discovery by orders of magnitude, fundamentally changing research approaches.",
        "DeepMind's GNoME program discovered millions of new crystals, including stable materials for future technologies.",
        "AI is enabling 'step function changes' in scientific understanding, not just incremental improvements.",
        "The advancements open up new opportunities for solving major global challenges, such as climate change and disease."
      ]
    }
  ],
  "keywords": [
    "AlphaFold",
    "protein folding",
    "AI"
  ],
  "target_language": "en"
},
  quality: {
  "completeness": {
    "rate": "Pass",
    "reason": "The analysis covers all key aspects of the provided content, from historical challenges to modern AI breakthroughs and future implications."
  },
  "structure": {
    "rate": "Pass",
    "reason": "The output perfectly adheres to the specified schema, including the correct formatting for title, summary, chapters, takeaways, and keywords. Takeaways are simple arrays as requested."
  },
  "no_garbage": {
    "rate": "Pass",
    "reason": "No promotional or meaningless content is present in the analysis. It focuses solely on the scientific and historical aspects of protein folding and AI."
  },
  "meta_language_avoidance": {
    "rate": "Pass",
    "reason": "The analysis successfully avoids meta-language phrases such as 'This chapter introduces' or 'This section covers', maintaining an objective, article-like tone."
  },
  "useful_keywords": {
    "rate": "Pass",
    "reason": "The keywords 'AlphaFold', 'protein folding', and 'AI' are highly relevant and useful for highlighting the core topics of the analysis."
  },
  "correct_language": {
    "rate": "Pass",
    "reason": "The content is entirely in English, matching the requested target language and maintaining natural fluency."
  }
},
  iterationCount: 1,
  chunksProcessed: 12,
};

// Export individual constants for easier testing
export const EXAMPLE_VIDEO_URL = exampleData.videoInfo.url;
export const EXAMPLE_TRANSCRIPT = exampleData.transcript;
export const EXAMPLE_ANALYSIS = exampleData.analysis;
export const EXAMPLE_QUALITY = exampleData.quality;
export const EXAMPLE_VIDEO_INFO = exampleData.videoInfo;

// Utility functions for testing
export const getExampleData = () => ({ ...exampleData });

export const createMockAnalysis = () => ({ ...EXAMPLE_ANALYSIS });

export const createMockQuality = () => ({ ...EXAMPLE_QUALITY });
