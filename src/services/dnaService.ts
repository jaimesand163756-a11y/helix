import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface DNAEntry {
  rsid: string;
  chromosome: string;
  position: string;
  allele1: string;
  allele2: string;
}

export interface PhysicalTraits {
  eyeColor: string;
  hairColor: string;
  hairType: string;
  skinTone: string;
  facialFeatures: string;
  estimatedAge: string;
  gender: string;
}

// Key SNPs for physical traits (simplified for demo)
const TRAIT_SNPS = [
  "rs12913832", // Eye color
  "rs1805007",  // Red hair
  "rs16891982", // Skin pigmentation
  "rs1426654",  // Skin pigmentation
  "rs12896399", // Hair color
  "rs3827760",  // Hair thickness/type
];

export async function analyzeDNA(dnaData: DNAEntry[]): Promise<PhysicalTraits> {
  // Filter for trait-related SNPs to reduce token usage
  const relevantData = dnaData.filter(entry => TRAIT_SNPS.includes(entry.rsid));
  
  // If no specific SNPs found, take a representative sample
  const sampleData = relevantData.length > 0 ? relevantData : dnaData.slice(0, 50);

  const prompt = `
    Analyze the following DNA SNP data (AncestryDNA format) and infer the most likely physical traits of this individual.
    Focus on: eye color, hair color, hair type, skin tone, facial features, estimated age range, and biological sex.
    
    Data (RSID, Chromosome, Position, Allele1, Allele2):
    ${sampleData.map(d => `${d.rsid}, ${d.chromosome}, ${d.position}, ${d.allele1}, ${d.allele2}`).join('\n')}
    
    Return the analysis in JSON format. Be descriptive with facial features.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          eyeColor: { type: Type.STRING },
          hairColor: { type: Type.STRING },
          hairType: { type: Type.STRING },
          skinTone: { type: Type.STRING },
          facialFeatures: { type: Type.STRING },
          estimatedAge: { type: Type.STRING },
          gender: { type: Type.STRING },
        },
        required: ["eyeColor", "hairColor", "hairType", "skinTone", "facialFeatures", "estimatedAge", "gender"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as PhysicalTraits;
}

export async function generatePortrait(traits: PhysicalTraits): Promise<string> {
  const prompt = `
    A hyper-realistic, cinematic portrait of a person with the following physical characteristics:
    - Eye Color: ${traits.eyeColor}
    - Hair: ${traits.hairColor}, ${traits.hairType}
    - Skin Tone: ${traits.skinTone}
    - Facial Features: ${traits.facialFeatures}
    - Estimated Age: ${traits.estimatedAge}
    - Gender: ${traits.gender}
    
    The lighting should be soft and professional, like a high-end photography studio. 
    Focus on a clear view of the face. Neutral background.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ text: prompt }],
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  let imageUrl = "";
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!imageUrl) throw new Error("Failed to generate image");
  return imageUrl;
}
