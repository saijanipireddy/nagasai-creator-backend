import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import supabase from '../config/db.js';
import logger from '../config/logger.js';
import { handleError } from '../middleware/errorHandler.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_QUESTIONS = 15;

/* ================================================================== */
/*  TTS: Convert AI text to speech audio                              */
/* ================================================================== */
async function textToSpeech(text) {
  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch (error) {
    logger.error({ err: error }, 'TTS generation failed');
    return null;
  }
}

/* ================================================================== */
/*  WHISPER: Transcribe student voice to text                         */
/* ================================================================== */
async function transcribeAudio(filePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(filePath),
      language: 'en',
    });
    return transcription.text;
  } catch (error) {
    logger.error({ err: error }, 'Whisper transcription failed');
    throw new Error('Failed to transcribe audio');
  }
}

/* ------------------------------------------------------------------ */
/*  ADMIN: Grant interview access to a student                        */
/* ------------------------------------------------------------------ */
export const grantAccess = async (req, res) => {
  try {
    const { studentId, skills, maxAttempts, expiresInDays } = req.body;

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, name, email')
      .eq('id', studentId)
      .single();

    if (studentErr || !student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const { data, error } = await supabase
      .from('interview_access')
      .insert({
        student_id: studentId,
        skills,
        granted_by: req.admin.id,
        max_attempts: maxAttempts,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error }, 'Failed to grant interview access');
      return res.status(500).json({ message: 'Failed to grant interview access' });
    }

    res.status(201).json({
      message: 'Interview access granted successfully',
      access: {
        _id: data.id,
        studentId: data.student_id,
        studentName: student.name,
        studentEmail: student.email,
        skills: data.skills,
        maxAttempts: data.max_attempts,
        attemptsUsed: data.attempts_used,
        status: data.status,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    handleError(res, error, 'grantAccess');
  }
};

/* ------------------------------------------------------------------ */
/*  ADMIN: Revoke interview access                                    */
/* ------------------------------------------------------------------ */
export const revokeAccess = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('interview_access')
      .update({ status: 'expired' })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Interview access not found' });
    }

    res.json({ message: 'Interview access revoked' });
  } catch (error) {
    handleError(res, error, 'revokeAccess');
  }
};

/* ------------------------------------------------------------------ */
/*  ADMIN: List all interview access records                          */
/* ------------------------------------------------------------------ */
export const listAllAccess = async (req, res) => {
  try {
    const { data: accessList, error } = await supabase
      .from('interview_access')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch interview access list' });
    }

    const studentIds = [...new Set(accessList.map((a) => a.student_id))];
    const { data: students } = await supabase
      .from('students')
      .select('id, name, email')
      .in('id', studentIds);

    const studentMap = {};
    (students || []).forEach((s) => {
      studentMap[s.id] = s;
    });

    const mapped = accessList.map((a) => ({
      _id: a.id,
      studentId: a.student_id,
      studentName: studentMap[a.student_id]?.name || 'Unknown',
      studentEmail: studentMap[a.student_id]?.email || '',
      skills: a.skills,
      status: a.status,
      maxAttempts: a.max_attempts,
      attemptsUsed: a.attempts_used,
      expiresAt: a.expires_at,
      createdAt: a.created_at,
    }));

    res.json({ accessList: mapped });
  } catch (error) {
    handleError(res, error, 'listAllAccess');
  }
};

/* ------------------------------------------------------------------ */
/*  ADMIN: List all interviews with reports                           */
/* ------------------------------------------------------------------ */
export const listAllInterviews = async (req, res) => {
  try {
    const { data: interviews, error } = await supabase
      .from('interviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch interviews' });
    }

    const studentIds = [...new Set(interviews.map((i) => i.student_id))];
    const interviewIds = interviews.map((i) => i.id);

    const [studentsRes, reportsRes] = await Promise.all([
      supabase.from('students').select('id, name, email').in('id', studentIds),
      supabase.from('interview_reports').select('*').in('interview_id', interviewIds),
    ]);

    const studentMap = {};
    (studentsRes.data || []).forEach((s) => {
      studentMap[s.id] = s;
    });

    const reportMap = {};
    (reportsRes.data || []).forEach((r) => {
      reportMap[r.interview_id] = r;
    });

    const mapped = interviews.map((i) => ({
      _id: i.id,
      studentId: i.student_id,
      studentName: studentMap[i.student_id]?.name || 'Unknown',
      studentEmail: studentMap[i.student_id]?.email || '',
      skills: i.skills,
      status: i.status,
      questionsAnswered: i.current_question_index,
      maxQuestions: i.max_questions,
      startedAt: i.started_at,
      completedAt: i.completed_at,
      createdAt: i.created_at,
      proctoringData: i.proctoring_data || null,
      report: reportMap[i.id]
        ? {
            overallScore: reportMap[i.id].overall_score,
            skillScores: reportMap[i.id].skill_scores,
            recommendation: reportMap[i.id].recommendation,
            strengths: reportMap[i.id].strengths,
            weaknesses: reportMap[i.id].weaknesses,
            detailedFeedback: reportMap[i.id].detailed_feedback,
          }
        : null,
    }));

    res.json({ interviews: mapped });
  } catch (error) {
    handleError(res, error, 'listAllInterviews');
  }
};

/* ------------------------------------------------------------------ */
/*  ADMIN: Get detailed interview report                              */
/* ------------------------------------------------------------------ */
export const getInterviewReport = async (req, res) => {
  try {
    const { id } = req.params;

    const [interviewRes, responsesRes, reportRes] = await Promise.all([
      supabase.from('interviews').select('*').eq('id', id).single(),
      supabase.from('interview_responses').select('*').eq('interview_id', id).order('question_index'),
      supabase.from('interview_reports').select('*').eq('interview_id', id).single(),
    ]);

    if (interviewRes.error || !interviewRes.data) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    const interview = interviewRes.data;

    const { data: student } = await supabase
      .from('students')
      .select('id, name, email')
      .eq('id', interview.student_id)
      .single();

    res.json({
      interview: {
        _id: interview.id,
        studentName: student?.name || 'Unknown',
        studentEmail: student?.email || '',
        skills: interview.skills,
        status: interview.status,
        questionsAnswered: interview.current_question_index,
        maxQuestions: interview.max_questions,
        startedAt: interview.started_at,
        completedAt: interview.completed_at,
        proctoringData: interview.proctoring_data || null,
      },
      responses: (responsesRes.data || []).map((r) => ({
        _id: r.id,
        questionIndex: r.question_index,
        question: r.question,
        answer: r.answer,
        score: r.score,
        feedback: r.feedback,
        skillTested: r.skill_tested,
      })),
      report: reportRes.data
        ? {
            overallScore: reportRes.data.overall_score,
            skillScores: reportRes.data.skill_scores,
            strengths: reportRes.data.strengths,
            weaknesses: reportRes.data.weaknesses,
            recommendation: reportRes.data.recommendation,
            detailedFeedback: reportRes.data.detailed_feedback,
          }
        : null,
    });
  } catch (error) {
    handleError(res, error, 'getInterviewReport');
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Check my interview access                                */
/* ------------------------------------------------------------------ */
export const getMyAccess = async (req, res) => {
  try {
    const studentId = req.student.id;

    const { data: accessList, error } = await supabase
      .from('interview_access')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch interview access' });
    }

    const now = new Date();
    const active = (accessList || []).filter((a) => {
      if (a.expires_at && new Date(a.expires_at) < now) return false;
      if (a.attempts_used >= a.max_attempts) return false;
      return true;
    });

    const { data: interviews } = await supabase
      .from('interviews')
      .select('id, skills, status, current_question_index, max_questions, started_at, completed_at, access_id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    const completedIds = (interviews || []).filter((i) => i.status === 'completed').map((i) => i.id);
    let reportMap = {};
    if (completedIds.length > 0) {
      const { data: reports } = await supabase
        .from('interview_reports')
        .select('interview_id, overall_score, recommendation')
        .in('interview_id', completedIds);

      (reports || []).forEach((r) => {
        reportMap[r.interview_id] = r;
      });
    }

    res.json({
      access: active.map((a) => ({
        _id: a.id,
        skills: a.skills,
        maxAttempts: a.max_attempts,
        attemptsUsed: a.attempts_used,
        expiresAt: a.expires_at,
        createdAt: a.created_at,
      })),
      interviews: (interviews || []).map((i) => ({
        _id: i.id,
        accessId: i.access_id,
        skills: i.skills,
        status: i.status,
        questionsAnswered: i.current_question_index,
        maxQuestions: i.max_questions,
        startedAt: i.started_at,
        completedAt: i.completed_at,
        report: reportMap[i.id]
          ? { overallScore: reportMap[i.id].overall_score, recommendation: reportMap[i.id].recommendation }
          : null,
      })),
    });
  } catch (error) {
    handleError(res, error, 'getMyAccess');
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Start an interview (returns AI greeting + TTS audio)     */
/* ------------------------------------------------------------------ */
export const startInterview = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { accessId } = req.params;

    const { data: access, error: accessErr } = await supabase
      .from('interview_access')
      .select('*')
      .eq('id', accessId)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .single();

    if (accessErr || !access) {
      return res.status(403).json({ message: 'No active interview access found' });
    }

    if (access.expires_at && new Date(access.expires_at) < new Date()) {
      await supabase.from('interview_access').update({ status: 'expired' }).eq('id', accessId);
      return res.status(403).json({ message: 'Interview access has expired' });
    }

    if (access.attempts_used >= access.max_attempts) {
      return res.status(403).json({ message: 'All interview attempts have been used' });
    }

    const { data: existing } = await supabase
      .from('interviews')
      .select('id')
      .eq('access_id', accessId)
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
      .single();

    if (existing) {
      return res.status(400).json({
        message: 'You already have an interview in progress',
        interviewId: existing.id,
      });
    }

    const skills = access.skills;
    const studentName = req.student.name;

    const systemPrompt = buildInterviewSystemPrompt(skills, studentName);
    const firstMessage = await generateAIResponse(systemPrompt, [], skills);

    // Generate TTS audio for AI greeting
    const audioBase64 = await textToSpeech(firstMessage);

    const conversationHistory = [{ role: 'assistant', content: firstMessage }];

    const { data: interview, error: createErr } = await supabase
      .from('interviews')
      .insert({
        access_id: accessId,
        student_id: studentId,
        skills,
        status: 'in_progress',
        conversation_history: conversationHistory,
        current_question_index: 0,
        max_questions: MAX_QUESTIONS,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createErr) {
      logger.error({ err: createErr }, 'Failed to create interview');
      return res.status(500).json({ message: 'Failed to start interview' });
    }

    await supabase
      .from('interview_access')
      .update({ attempts_used: access.attempts_used + 1 })
      .eq('id', accessId);

    res.status(201).json({
      message: 'Interview started',
      interview: {
        _id: interview.id,
        skills,
        status: 'in_progress',
        maxQuestions: MAX_QUESTIONS,
        currentQuestion: 0,
      },
      aiMessage: firstMessage,
      audioBase64,
    });
  } catch (error) {
    handleError(res, error, 'startInterview');
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Send text message during interview (+ TTS response)      */
/* ------------------------------------------------------------------ */
export const sendMessage = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { interviewId } = req.params;
    const { message, elapsedSeconds } = req.body;

    const result = await processAnswer(interviewId, studentId, message, req.student.name, parseInt(elapsedSeconds) || 0);
    res.json(result);
  } catch (error) {
    handleError(res, error, 'sendMessage');
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Send voice answer (Whisper transcribe + process + TTS)   */
/* ------------------------------------------------------------------ */
export const sendVoice = async (req, res) => {
  const tempPath = req.file?.path;
  try {
    const studentId = req.student.id;
    const { interviewId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    // Transcribe with Whisper
    const transcription = await transcribeAudio(tempPath);

    if (!transcription || transcription.trim().length === 0) {
      return res.status(400).json({ message: 'Could not understand the audio. Please try again.' });
    }

    const elapsedSeconds = parseInt(req.body?.elapsedSeconds) || 0;
    const result = await processAnswer(interviewId, studentId, transcription, req.student.name, elapsedSeconds);
    res.json({ ...result, transcription });
  } catch (error) {
    handleError(res, error, 'sendVoice');
  } finally {
    // Clean up temp audio file
    if (tempPath) {
      fs.unlink(tempPath, () => {});
    }
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Get interview detail (for resuming)                      */
/* ------------------------------------------------------------------ */
export const getInterview = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { interviewId } = req.params;

    const { data: interview, error } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .eq('student_id', studentId)
      .single();

    if (error || !interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    let report = null;
    if (interview.status === 'completed') {
      const { data: reportData } = await supabase
        .from('interview_reports')
        .select('*')
        .eq('interview_id', interviewId)
        .single();

      if (reportData) {
        report = {
          overallScore: reportData.overall_score,
          skillScores: reportData.skill_scores,
          strengths: reportData.strengths,
          weaknesses: reportData.weaknesses,
          recommendation: reportData.recommendation,
          detailedFeedback: reportData.detailed_feedback,
        };
      }
    }

    res.json({
      interview: {
        _id: interview.id,
        skills: interview.skills,
        status: interview.status,
        conversationHistory: interview.conversation_history,
        currentQuestion: interview.current_question_index,
        maxQuestions: interview.max_questions,
        startedAt: interview.started_at,
        completedAt: interview.completed_at,
      },
      report,
    });
  } catch (error) {
    handleError(res, error, 'getInterview');
  }
};

/* ================================================================== */
/*  SHARED: Process an answer (text or transcribed voice)             */
/* ================================================================== */
async function processAnswer(interviewId, studentId, answerText, studentName, elapsedSeconds = 0) {
  const { data: interview, error: fetchErr } = await supabase
    .from('interviews')
    .select('*')
    .eq('id', interviewId)
    .eq('student_id', studentId)
    .eq('status', 'in_progress')
    .single();

  if (fetchErr || !interview) {
    const err = new Error('Active interview not found');
    err.status = 404;
    throw err;
  }

  const conversationHistory = interview.conversation_history || [];
  const questionIndex = interview.current_question_index;
  const skills = interview.skills;

  conversationHistory.push({ role: 'user', content: answerText });

  const lastAiMessage =
    conversationHistory.filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';

  const scoreResult = await scoreAnswer(lastAiMessage, answerText, skills);

  await supabase.from('interview_responses').insert({
    interview_id: interviewId,
    question_index: questionIndex,
    question: lastAiMessage,
    answer: answerText,
    score: scoreResult.score,
    feedback: scoreResult.feedback,
    skill_tested: scoreResult.skillTested,
  });

  const newQuestionIndex = questionIndex + 1;
  const INTERVIEW_DURATION = 40 * 60; // 40 minutes

  // End the interview if max questions reached OR time is up (>= 40 min)
  const timeUp = elapsedSeconds >= INTERVIEW_DURATION;
  const questionsUp = newQuestionIndex >= interview.max_questions;

  if (questionsUp || timeUp) {
    const closingMsg = timeUp
      ? "That's all the time we have for today's interview. Thank you so much for your time and thoughtful answers. I'll now generate your performance report. Best of luck!"
      : "Thank you for completing this interview! You've answered all the questions. I'll now generate your performance report. Good luck!";

    conversationHistory.push({ role: 'assistant', content: closingMsg });

    const audioBase64 = await textToSpeech(closingMsg);

    await supabase
      .from('interviews')
      .update({
        status: 'completed',
        conversation_history: conversationHistory,
        current_question_index: newQuestionIndex,
        completed_at: new Date().toISOString(),
      })
      .eq('id', interviewId);

    generateReport(interviewId, studentId).catch((err) =>
      logger.error({ err }, 'Failed to generate interview report')
    );

    return {
      aiMessage: closingMsg,
      audioBase64,
      completed: true,
      questionIndex: newQuestionIndex,
      score: scoreResult.score,
      feedback: scoreResult.feedback,
    };
  }

  const systemPrompt = buildInterviewSystemPrompt(skills, studentName, elapsedSeconds, interview.max_questions, newQuestionIndex);
  const aiResponse = await generateAIResponse(systemPrompt, conversationHistory, skills);

  conversationHistory.push({ role: 'assistant', content: aiResponse });

  // Generate TTS for the next question
  const audioBase64 = await textToSpeech(aiResponse);

  await supabase
    .from('interviews')
    .update({
      conversation_history: conversationHistory,
      current_question_index: newQuestionIndex,
    })
    .eq('id', interviewId);

  return {
    aiMessage: aiResponse,
    audioBase64,
    completed: false,
    questionIndex: newQuestionIndex,
    maxQuestions: interview.max_questions,
    score: scoreResult.score,
    feedback: scoreResult.feedback,
  };
}

/* ------------------------------------------------------------------ */
/*  STUDENT: Complete interview early (exit) + generate report        */
/* ------------------------------------------------------------------ */
export const completeInterview = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { interviewId } = req.params;
    const { proctoringData } = req.body;

    const { data: interview, error: fetchErr } = await supabase
      .from('interviews')
      .select('*')
      .eq('id', interviewId)
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
      .single();

    if (fetchErr || !interview) {
      return res.status(404).json({ message: 'Active interview not found' });
    }

    // Mark as completed and save proctoring data
    await supabase
      .from('interviews')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...(proctoringData ? { proctoring_data: proctoringData } : {}),
      })
      .eq('id', interviewId);

    // Generate report if at least 1 question was answered
    if (interview.current_question_index > 0) {
      generateReport(interviewId, studentId).catch((err) =>
        logger.error({ err }, 'Failed to generate interview report on early exit')
      );
    }

    res.json({ message: 'Interview completed successfully' });
  } catch (error) {
    handleError(res, error, 'completeInterview');
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT: Save proctoring data for an interview                    */
/* ------------------------------------------------------------------ */
export const saveProctoring = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { interviewId } = req.params;
    const { proctoringData } = req.body;

    if (!proctoringData) {
      return res.status(400).json({ message: 'No proctoring data provided' });
    }

    const { error } = await supabase
      .from('interviews')
      .update({ proctoring_data: proctoringData })
      .eq('id', interviewId)
      .eq('student_id', studentId);

    if (error) {
      logger.error({ err: error }, 'Failed to save proctoring data');
      return res.status(500).json({ message: 'Failed to save proctoring data' });
    }

    res.json({ message: 'Proctoring data saved' });
  } catch (error) {
    handleError(res, error, 'saveProctoring');
  }
};

/* ================================================================== */
/*  AI HELPERS                                                        */
/* ================================================================== */

function buildInterviewSystemPrompt(skills, studentName, elapsedSeconds = 0, maxQuestions = 15, currentQuestionIndex = 0) {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const INTERVIEW_DURATION_MINS = 40;
  const remainingMinutes = INTERVIEW_DURATION_MINS - elapsedMinutes;
  const remainingQuestions = maxQuestions - currentQuestionIndex;

  let timeGuidance = '';
  if (remainingMinutes <= 5 && remainingMinutes > 2) {
    timeGuidance = `\n\nTIME CHECK: About ${remainingMinutes} minutes remaining. Start wrapping up naturally — say something like "We're running a bit short on time, let me ask you one more important question" and ask a final comprehensive question that covers the most important skill not yet tested well.`;
  } else if (remainingMinutes <= 2) {
    timeGuidance = `\n\nTIME CHECK: Less than 2 minutes left. This should be your LAST question. Wrap up warmly — say something like "We're almost out of time, so let me ask you one final question" and then ask a quick but meaningful closing question.`;
  } else if (remainingMinutes <= 10) {
    timeGuidance = `\n\nTIME CHECK: About ${remainingMinutes} minutes remaining out of ${INTERVIEW_DURATION_MINS}. You're in the later part of the interview — focus on the skills not yet covered well and make your questions count.`;
  }

  return `You are an expert technical interviewer conducting a real-time VOICE interview. The candidate's name is ${studentName}.

You are interviewing for the following skills: ${skills.join(', ')}.

IMPORTANT - This is a VOICE interview, so:
- Speak naturally and conversationally, as if talking face-to-face
- Keep your questions SHORT and CLEAR (they will be spoken aloud via text-to-speech)
- Do NOT use code blocks, bullet points, or formatting — speak everything as natural sentences
- Do NOT say "let me ask you" repeatedly — vary your transitions
- React to answers naturally: "That's a good point", "Interesting", "I see" before asking next question

Interview Guidelines:
- Ask ONE question at a time
- Start with a warm greeting and an easy introductory question
- Gradually increase difficulty from basic to intermediate to advanced
- Cover all the listed skills throughout the interview
- Ask follow-up questions based on the candidate's answers when appropriate
- Be professional but friendly, like a real interviewer
- Mix question types: conceptual, practical scenarios, debugging, and real-world application
- If the candidate gives a wrong answer, acknowledge politely and move on
- Do NOT provide answers or hints
- Ask about the candidate's real projects and experience when relevant — for example "Can you tell me about a project where you used React?" or "How did you handle state management in your projects?"

Question Distribution:
- Distribute questions evenly across all skills
- For each skill: start with fundamentals, then progress to practical application
- Include at least 1-2 questions per skill

Session Info: This is question ${currentQuestionIndex + 1}, interview has been going for ${elapsedMinutes} minutes, up to ${maxQuestions} questions or ${INTERVIEW_DURATION_MINS} minutes total.${timeGuidance}`;
}

async function generateAIResponse(systemPrompt, conversationHistory, skills) {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || 'Could you please elaborate on that?';
  } catch (error) {
    logger.error({ err: error }, 'OpenAI API error in generateAIResponse');
    throw new Error('Failed to generate AI response');
  }
}

async function scoreAnswer(question, answer, skills) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert technical interviewer scoring candidate answers.
The interview covers these skills: ${skills.join(', ')}.

Score the answer from 0-10 where:
- 0-2: Completely wrong or no understanding
- 3-4: Basic understanding but significant gaps
- 5-6: Adequate understanding with some gaps
- 7-8: Good understanding with minor issues
- 9-10: Excellent, comprehensive answer

Respond in JSON format ONLY:
{
  "score": <number 0-10>,
  "feedback": "<brief feedback on the answer>",
  "skillTested": "<which skill from the list this question tested>"
}`,
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nCandidate's Answer: ${answer}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = JSON.parse(content);
    return {
      score: Math.min(10, Math.max(0, parseInt(parsed.score) || 0)),
      feedback: parsed.feedback || '',
      skillTested: parsed.skillTested || skills[0],
    };
  } catch (error) {
    logger.error({ err: error }, 'OpenAI API error in scoreAnswer');
    return { score: 5, feedback: 'Unable to score this answer', skillTested: skills[0] };
  }
}

async function generateReport(interviewId, studentId) {
  const { data: responses } = await supabase
    .from('interview_responses')
    .select('*')
    .eq('interview_id', interviewId)
    .order('question_index');

  if (!responses || responses.length === 0) return;

  const { data: interview } = await supabase
    .from('interviews')
    .select('skills')
    .eq('id', interviewId)
    .single();

  const skills = interview?.skills || [];

  const skillScoreMap = {};
  const skillCountMap = {};

  responses.forEach((r) => {
    const skill = r.skill_tested || 'General';
    skillScoreMap[skill] = (skillScoreMap[skill] || 0) + r.score;
    skillCountMap[skill] = (skillCountMap[skill] || 0) + 1;
  });

  const skillScores = {};
  for (const skill of Object.keys(skillScoreMap)) {
    skillScores[skill] = Math.round((skillScoreMap[skill] / skillCountMap[skill]) * 10) / 10;
  }

  const totalScore = responses.reduce((sum, r) => sum + r.score, 0) / responses.length;
  const overallScore = Math.round(totalScore * 10) / 10;

  const qaText = responses
    .map(
      (r, i) =>
        `Q${i + 1} [${r.skill_tested}]: ${r.question}\nA: ${r.answer}\nScore: ${r.score}/10`
    )
    .join('\n\n');

  let recommendation;
  if (overallScore >= 8.5) recommendation = 'STRONG_HIRE';
  else if (overallScore >= 7) recommendation = 'HIRE';
  else if (overallScore >= 5.5) recommendation = 'MAYBE';
  else if (overallScore >= 3.5) recommendation = 'NO_HIRE';
  else recommendation = 'STRONG_NO_HIRE';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert interviewer generating a final assessment report.
Analyze the interview Q&A and provide a JSON response:
{
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "detailedFeedback": "A comprehensive 2-3 paragraph assessment of the candidate's performance"
}`,
        },
        {
          role: 'user',
          content: `Skills tested: ${skills.join(', ')}\nOverall score: ${overallScore}/10\n\n${qaText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const feedback = JSON.parse(completion.choices[0]?.message?.content);

    await supabase.from('interview_reports').insert({
      interview_id: interviewId,
      student_id: studentId,
      overall_score: overallScore,
      skill_scores: skillScores,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      recommendation,
      detailed_feedback: feedback.detailedFeedback || '',
    });

    const { data: interviewData } = await supabase
      .from('interviews')
      .select('access_id')
      .eq('id', interviewId)
      .single();

    if (interviewData) {
      const { data: access } = await supabase
        .from('interview_access')
        .select('max_attempts, attempts_used')
        .eq('id', interviewData.access_id)
        .single();

      if (access && access.attempts_used >= access.max_attempts) {
        await supabase
          .from('interview_access')
          .update({ status: 'completed' })
          .eq('id', interviewData.access_id);
      }
    }

    logger.info({ interviewId }, 'Interview report generated successfully');
  } catch (error) {
    logger.error({ err: error, interviewId }, 'Failed to generate report via GPT');

    await supabase.from('interview_reports').insert({
      interview_id: interviewId,
      student_id: studentId,
      overall_score: overallScore,
      skill_scores: skillScores,
      strengths: [],
      weaknesses: [],
      recommendation,
      detailed_feedback: 'Report generated from scores only.',
    });
  }
}
