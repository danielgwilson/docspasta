import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. 
// do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

export async function processDocPage(content: string, apiKey: string): Promise<{
  isValid: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a documentation processing expert specializing in programming documentation. Your task is to:
1. Analyze if the provided HTML content is a programming documentation page
2. If valid, extract and format the content maintaining:
   - Code blocks with proper syntax highlighting
   - Section hierarchy and structure
   - Important callouts and notes
   - Method signatures and parameters
   - Examples and their explanations
3. Remove any navigation elements, headers, footers, or sidebars
4. Preserve only the main documentation content

Return JSON in this format:
{
  "isValid": boolean,
  "content": string, // Clean markdown with preserved formatting
  "reason": string,  // Explanation of why this is/isn't valid documentation
  "metadata": {
    "type": string,  // e.g. "api", "guide", "reference", "tutorial"
    "language": string, // Programming language if detected
    "framework": string // Framework/library if detected
  }
}`
        },
        {
          role: "user",
          content: content
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    if (!result.isValid) {
      return {
        isValid: false,
        error: result.reason
      };
    }

    return {
      isValid: true,
      content: result.content
    };

  } catch (error: any) {
    return {
      isValid: false,
      error: error.message
    };
  }
}
