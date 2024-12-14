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
          content: 
            "You are a documentation processing expert. Analyze the provided HTML content and determine if it's a programming documentation page. If it is, extract and format the content in clean markdown. Return JSON in this format: { 'isValid': boolean, 'content': string, 'reason': string }"
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
