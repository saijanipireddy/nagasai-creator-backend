import Groq from 'groq-sdk';
import logger from '../config/logger.js';
import { handleError } from '../middleware/errorHandler.js';

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

export const generateResume = async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: 'Resume generation service is not configured. Please contact the administrator.' });
    }

    const {
      fullName, email, phone, linkedinUrl, githubUrl,
      summary, skills, experience, education, projects,
      certifications, targetRole,
    } = req.body;

    const prompt = `You are an expert ATS-friendly resume writer. Given the following candidate information, generate a professional resume optimized for Applicant Tracking Systems.

Target Role: ${targetRole}

Candidate Information:
- Name: ${fullName}
- Email: ${email}
- Phone: ${phone}
- LinkedIn: ${linkedinUrl || 'N/A'}
- GitHub: ${githubUrl || 'N/A'}

Professional Summary: ${summary}

Skills: ${skills.join(', ')}

Work Experience:
${experience.length > 0 ? experience.map(e => `- ${e.role} at ${e.company} (${e.duration}): ${e.description}`).join('\n') : 'No work experience provided.'}

Education:
${education.map(e => `- ${e.degree} from ${e.institution} (${e.year})${e.gpa ? ', GPA: ' + e.gpa : ''}`).join('\n')}

Projects:
${projects.length > 0 ? projects.map(p => `- ${p.name}: ${p.description} | Tech: ${p.techStack}${p.link ? ' | Link: ' + p.link : ''}`).join('\n') : 'No projects provided.'}

Certifications: ${certifications.length > 0 ? certifications.join(', ') : 'None'}

Instructions:
1. Rewrite the professional summary to be compelling, concise (2-3 sentences), and tailored to the target role.
2. For each work experience entry, generate 3-4 bullet points using strong action verbs and quantified achievements where possible.
3. For each project, write 2-3 bullet points highlighting technical skills and impact.
4. Organize skills into categories (e.g., Programming Languages, Frameworks, Tools).
5. Ensure all content uses keywords relevant to the target role for ATS optimization.
6. Return ONLY valid JSON with no extra text, no markdown, no code blocks. Just the raw JSON object matching this structure:

{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "linkedinUrl": "string or empty",
  "githubUrl": "string or empty",
  "summary": "rewritten professional summary",
  "skillCategories": [
    { "category": "Category Name", "skills": ["Skill1", "Skill2"] }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "duration": "string",
      "bullets": ["Achievement bullet 1", "Achievement bullet 2"]
    }
  ],
  "education": [
    { "institution": "string", "degree": "string", "year": "string", "gpa": "string or empty" }
  ],
  "projects": [
    {
      "name": "string",
      "techStack": "string",
      "link": "string or empty",
      "bullets": ["Project bullet 1", "Project bullet 2"]
    }
  ],
  "certifications": ["cert1", "cert2"]
}`;

    const groq = new Groq({ apiKey });

    let lastError = null;
    for (const modelName of MODELS) {
      try {
        logger.info(`Trying Groq model: ${modelName}`);
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are an expert ATS resume writer. Always respond with valid JSON only. No markdown, no code blocks, no extra text.' },
            { role: 'user', content: prompt },
          ],
          model: modelName,
          temperature: 0.7,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        });

        const responseText = chatCompletion.choices[0]?.message?.content;
        if (!responseText) {
          logger.warn(`Model ${modelName} returned empty response, trying next...`);
          continue;
        }

        let resumeData;
        try {
          resumeData = JSON.parse(responseText);
        } catch {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resumeData = JSON.parse(jsonMatch[0]);
          } else {
            logger.warn(`Model ${modelName} returned invalid JSON, trying next...`);
            continue;
          }
        }

        logger.info(`Success with Groq model: ${modelName}`);
        return res.json({ message: 'Resume generated successfully', data: resumeData });
      } catch (err) {
        logger.error({ status: err.status, message: err.message?.slice(0, 200) }, `Groq model ${modelName} failed`);
        lastError = err;
        if (err.status === 429 || err.status === 404 || err.status === 503) {
          continue;
        }
        break;
      }
    }

    if (lastError?.status === 429) {
      return res.status(429).json({ message: 'AI service rate limit reached. Please wait a minute and try again.' });
    }
    if (lastError?.status === 401) {
      return res.status(503).json({ message: 'AI service API key is invalid. Please contact the administrator.' });
    }
    handleError(res, lastError || new Error('All AI models failed'), 'generateResume');
  } catch (err) {
    logger.error({ err }, 'Resume Controller Error');
    handleError(res, err, 'generateResume');
  }
};
