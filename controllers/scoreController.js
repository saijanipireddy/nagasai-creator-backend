import supabase from '../config/db.js';

// @desc    Submit practice (MCQ) score
// @route   POST /api/scores/practice
// @access  Private/Student
export const submitPracticeScore = async (req, res) => {
  try {
    const { topicId, score, total } = req.body;
    const studentId = req.student.id;

    if (!topicId || score === undefined || !total) {
      return res.status(400).json({ message: 'topicId, score, and total are required' });
    }

    const percentage = Math.round((score / total) * 100 * 100) / 100;

    const { data, error } = await supabase
      .from('practice_scores')
      .upsert(
        {
          student_id: studentId,
          topic_id: topicId,
          score,
          total,
          percentage,
        },
        { onConflict: 'student_id,topic_id' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      studentId: data.student_id,
      topicId: data.topic_id,
      score: data.score,
      total: data.total,
      percentage: data.percentage,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit coding result (legacy — kept for backwards compat)
// @route   POST /api/scores/coding
// @access  Private/Student
export const submitCodingScore = async (req, res) => {
  try {
    const { topicId, passed, code, output, language } = req.body;
    const studentId = req.student.id;

    if (!topicId || passed === undefined) {
      return res.status(400).json({ message: 'topicId and passed are required' });
    }

    const { data, error } = await supabase
      .from('coding_submissions')
      .upsert(
        {
          student_id: studentId,
          topic_id: topicId,
          passed: !!passed,
          code: code || '',
          output: output || '',
          language: language || 'javascript',
        },
        { onConflict: 'student_id,topic_id' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      studentId: data.student_id,
      topicId: data.topic_id,
      passed: data.passed,
      language: data.language,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Piston API language config (mirrors frontend LANGUAGE_CONFIG)
const PISTON_LANGUAGES = {
  python: { lang: 'python', version: '3.10.0' },
  java: { lang: 'java', version: '15.0.2' },
  cpp: { lang: 'c++', version: '10.2.0' },
  c: { lang: 'c', version: '10.2.0' },
  typescript: { lang: 'typescript', version: '5.0.3' },
  php: { lang: 'php', version: '8.2.3' },
  ruby: { lang: 'ruby', version: '3.0.1' },
  go: { lang: 'go', version: '1.16.2' },
  rust: { lang: 'rust', version: '1.68.2' },
  kotlin: { lang: 'kotlin', version: '1.8.20' },
  swift: { lang: 'swift', version: '5.3.3' },
};

// Execute code via Piston API
const executePiston = async (sourceCode, language, stdin = '') => {
  const config = PISTON_LANGUAGES[language];
  if (!config) return { success: false, output: `Unsupported language: ${language}` };

  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: config.lang,
        version: config.version,
        files: [{ content: sourceCode }],
        stdin: stdin || '',
      }),
    });

    if (!response.ok) return { success: false, output: 'Execution service unavailable' };
    const data = await response.json();

    if (data.run) {
      const output = data.run.output || data.run.stdout || '';
      const error = data.run.stderr || '';
      if (error && !output) return { success: false, output: error };
      return { success: true, output: output || error || '' };
    }
    return { success: false, output: 'No output received' };
  } catch (err) {
    return { success: false, output: `Execution error: ${err.message}` };
  }
};

// @desc    Get student's existing coding submission for a topic
// @route   GET /api/scores/coding-submission/:topicId
// @access  Private/Student
export const getCodingSubmission = async (req, res) => {
  try {
    const { topicId } = req.params;
    const studentId = req.student.id;

    const { data, error } = await supabase
      .from('coding_submissions')
      .select('*')
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ submission: null });
    }

    res.json({
      submission: {
        id: data.id,
        topicId: data.topic_id,
        passed: data.passed,
        code: data.code,
        output: data.output,
        language: data.language,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit coding challenge (server-side validated)
// @route   POST /api/scores/coding-submit
// @access  Private/Student
export const submitCodingChallenge = async (req, res) => {
  try {
    const { topicId, code, language, testResults } = req.body;
    const studentId = req.student.id;

    if (!topicId || !code) {
      return res.status(400).json({ message: 'topicId and code are required' });
    }

    // Fetch coding practice from DB
    const { data: cp, error: cpErr } = await supabase
      .from('coding_practices')
      .select('expected_output, test_cases, test_script, language')
      .eq('topic_id', topicId)
      .maybeSingle();

    if (cpErr) throw cpErr;
    if (!cp) {
      return res.status(404).json({ message: 'No coding practice found for this topic' });
    }

    const isWeb = ['html', 'css', 'javascript'].includes(cp.language);
    let passed = false;
    let actualOutput = '';
    const results = [];

    if (isWeb) {
      if (cp.test_script && cp.test_script.trim() && testResults && Array.isArray(testResults) && testResults.length > 0) {
        // Has test script and test results from iframe
        const totalTests = testResults.length;
        const passedTests = testResults.filter(r => r === 'PASS').length;
        passed = totalTests > 0 && passedTests === totalTests;
        actualOutput = testResults.join('\n');
        results.push({ total: totalTests, passed: passedTests });
      } else if (cp.test_script && cp.test_script.trim()) {
        // Has test script but no results received
        passed = false;
        actualOutput = 'Test results not received';
        results.push({ total: 1, passed: 0 });
      } else {
        // No test script - accept as completed (visual practice)
        passed = true;
        actualOutput = 'Completed';
        results.push({ total: 0, passed: 0, visual: true });
      }
    } else {
      // Non-web: server executes code and compares output
      const testCases = cp.test_cases || [];

      if (testCases.length > 0) {
        // Run each test case
        for (const tc of testCases) {
          const result = await executePiston(code, cp.language, tc.input || '');
          const expected = (tc.expectedOutput || '').trim();
          const actual = (result.output || '').trim();
          const tcPassed = actual === expected;
          results.push({
            input: tc.input || '',
            expected,
            actual,
            passed: tcPassed,
          });
        }
        const passedCount = results.filter(r => r.passed).length;
        passed = passedCount === results.length;
        actualOutput = results.map(r => r.actual).join('\n---\n');
      } else {
        // Fallback: single expectedOutput comparison
        const result = await executePiston(code, cp.language);
        actualOutput = (result.output || '').trim();
        const expected = (cp.expected_output || '').trim();
        passed = actualOutput === expected;
        results.push({ expected, actual: actualOutput, passed });
      }
    }

    // Save submission
    const { data, error } = await supabase
      .from('coding_submissions')
      .upsert(
        {
          student_id: studentId,
          topic_id: topicId,
          passed,
          code,
          output: actualOutput,
          language: language || cp.language,
        },
        { onConflict: 'student_id,topic_id' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      studentId: data.student_id,
      topicId: data.topic_id,
      passed: data.passed,
      language: data.language,
      results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit a practice attempt with full answers
// @route   POST /api/scores/practice-attempt
// @access  Private/Student
export const submitPracticeAttempt = async (req, res) => {
  try {
    const { topicId, answers, timeTakenSeconds } = req.body;
    const studentId = req.student.id;

    if (!topicId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'topicId and answers array are required' });
    }

    // Calculate score from answers
    // answers format: [{ questionIndex, selectedOption, correctOption, question, options }]
    const total = answers.length;
    const correctCount = answers.filter(a => a.selectedOption === a.correctOption).length;
    const percentage = Math.round((correctCount / total) * 100 * 100) / 100;
    const passed = percentage >= 80;

    // Get next attempt number
    const { data: lastAttempt, error: lastErr } = await supabase
      .from('practice_attempts')
      .select('attempt_number')
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) throw lastErr;

    const attemptNumber = (lastAttempt?.attempt_number || 0) + 1;

    // Insert attempt
    const { data, error } = await supabase
      .from('practice_attempts')
      .insert({
        student_id: studentId,
        topic_id: topicId,
        attempt_number: attemptNumber,
        score: correctCount,
        total,
        percentage,
        passed,
        time_taken_seconds: timeTakenSeconds || 0,
        answers,
      })
      .select()
      .single();

    if (error) throw error;

    // Update practice_scores with best score (for leaderboard)
    const { data: currentBest } = await supabase
      .from('practice_scores')
      .select('percentage')
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .maybeSingle();

    if (!currentBest || percentage > parseFloat(currentBest.percentage)) {
      await supabase
        .from('practice_scores')
        .upsert(
          {
            student_id: studentId,
            topic_id: topicId,
            score: correctCount,
            total,
            percentage,
          },
          { onConflict: 'student_id,topic_id' }
        );
    }

    res.json({
      id: data.id,
      attemptNumber: data.attempt_number,
      score: data.score,
      total: data.total,
      percentage: parseFloat(data.percentage),
      passed: data.passed,
      timeTakenSeconds: data.time_taken_seconds,
      createdAt: data.created_at,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all practice attempts for a topic (without answers, for dashboard)
// @route   GET /api/scores/practice-attempts/:topicId
// @access  Private/Student
export const getPracticeAttempts = async (req, res) => {
  try {
    const { topicId } = req.params;
    const studentId = req.student.id;

    const { data, error } = await supabase
      .from('practice_attempts')
      .select('id, attempt_number, score, total, percentage, passed, time_taken_seconds, created_at')
      .eq('student_id', studentId)
      .eq('topic_id', topicId)
      .order('attempt_number', { ascending: false });

    if (error) throw error;

    const attempts = (data || []).map(a => ({
      id: a.id,
      attemptNumber: a.attempt_number,
      score: a.score,
      total: a.total,
      percentage: parseFloat(a.percentage),
      passed: a.passed,
      timeTakenSeconds: a.time_taken_seconds,
      createdAt: a.created_at,
    }));

    // Get best score
    const best = attempts.reduce((max, a) => a.percentage > max ? a.percentage : max, 0);

    res.json({ attempts, bestPercentage: best });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single practice attempt detail with answers (for review)
// @route   GET /api/scores/practice-attempt/:attemptId
// @access  Private/Student
export const getPracticeAttemptDetail = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.student.id;

    const { data, error } = await supabase
      .from('practice_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    res.json({
      id: data.id,
      attemptNumber: data.attempt_number,
      score: data.score,
      total: data.total,
      percentage: parseFloat(data.percentage),
      passed: data.passed,
      timeTakenSeconds: data.time_taken_seconds,
      answers: data.answers,
      createdAt: data.created_at,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get student's progress (all scores + stats)
// @route   GET /api/scores/my-progress
// @access  Private/Student
export const getMyProgress = async (req, res) => {
  try {
    const studentId = req.student.id;

    const [practiceRes, codingRes] = await Promise.all([
      supabase
        .from('practice_scores')
        .select('*')
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('coding_submissions')
        .select('*')
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false }),
    ]);

    if (practiceRes.error) throw practiceRes.error;
    if (codingRes.error) throw codingRes.error;

    const practiceScores = (practiceRes.data || []).map((p) => ({
      id: p.id,
      topicId: p.topic_id,
      score: p.score,
      total: p.total,
      percentage: parseFloat(p.percentage),
      updatedAt: p.updated_at,
    }));

    const codingSubmissions = (codingRes.data || []).map((c) => ({
      id: c.id,
      topicId: c.topic_id,
      passed: c.passed,
      language: c.language,
      updatedAt: c.updated_at,
    }));

    const practicePoints = practiceScores.reduce((sum, p) => sum + p.percentage, 0);
    const codingPoints = codingSubmissions.filter((c) => c.passed).length * 100;
    const topicsCompleted = new Set([
      ...practiceScores.map((p) => p.topicId),
      ...codingSubmissions.map((c) => c.topicId),
    ]).size;

    res.json({
      practiceScores,
      codingSubmissions,
      stats: {
        totalPoints: Math.round(practicePoints) + codingPoints,
        practicePoints: Math.round(practicePoints),
        codingPoints,
        topicsCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark a topic sub-item as complete
// @route   POST /api/scores/complete
// @access  Private/Student
export const markComplete = async (req, res) => {
  try {
    const { topicId, itemType } = req.body;
    const studentId = req.student.id;

    if (!topicId || !itemType) {
      return res.status(400).json({ message: 'topicId and itemType are required' });
    }

    const validTypes = ['video', 'ppt', 'practice', 'codingPractice'];
    if (!validTypes.includes(itemType)) {
      return res.status(400).json({ message: `itemType must be one of: ${validTypes.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('topic_completions')
      .upsert(
        {
          student_id: studentId,
          topic_id: topicId,
          item_type: itemType,
        },
        { onConflict: 'student_id,topic_id,item_type' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      studentId: data.student_id,
      topicId: data.topic_id,
      itemType: data.item_type,
      completedAt: data.completed_at,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get completions for a student (optionally filtered by courseId)
// @route   GET /api/scores/completions
// @access  Private/Student
export const getCompletions = async (req, res) => {
  try {
    const studentId = req.student.id;
    const { courseId } = req.query;

    let query = supabase
      .from('topic_completions')
      .select('topic_id, item_type')
      .eq('student_id', studentId);

    // If courseId provided, join through topics to filter
    if (courseId) {
      // First get topic IDs for this course
      const { data: courseTopics, error: topicErr } = await supabase
        .from('topics')
        .select('id')
        .eq('course_id', courseId);

      if (topicErr) throw topicErr;

      const topicIds = (courseTopics || []).map((t) => t.id);
      if (topicIds.length === 0) {
        return res.json({ completions: {} });
      }

      query = query.in('topic_id', topicIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Build map: { topicId: ['video', 'ppt', ...] }
    const completions = {};
    for (const row of data || []) {
      if (!completions[row.topic_id]) {
        completions[row.topic_id] = [];
      }
      completions[row.topic_id].push(row.item_type);
    }

    res.json({ completions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get leaderboard (top 50 + current student rank)
// @route   GET /api/scores/leaderboard
// @access  Private/Student
export const getLeaderboard = async (req, res) => {
  try {
    const studentId = req.student.id;

    // Get top 50 from view
    const { data: topScorers, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(50);

    if (error) throw error;

    const leaderboard = (topScorers || []).map((row, index) => ({
      rank: index + 1,
      studentId: row.student_id,
      studentName: row.student_name,
      practicePoints: row.practice_points,
      codingPoints: row.coding_points,
      totalPoints: row.total_points,
      isCurrentUser: row.student_id === studentId,
    }));

    // Find current student's rank
    const currentUserEntry = leaderboard.find((e) => e.isCurrentUser);
    let myRank = currentUserEntry ? currentUserEntry.rank : null;

    // If student not in top 50, calculate rank efficiently using count
    if (!myRank) {
      // Step 1: Get this student's total points (1 row)
      const { data: myEntry, error: myErr } = await supabase
        .from('leaderboard')
        .select('total_points')
        .eq('student_id', studentId)
        .maybeSingle();

      if (!myErr && myEntry) {
        // Step 2: Count students with more points (1 integer)
        const { count, error: countErr } = await supabase
          .from('leaderboard')
          .select('*', { count: 'exact', head: true })
          .gt('total_points', myEntry.total_points);

        if (!countErr) {
          // Rank = count of students above + 1
          myRank = (count || 0) + 1;
        }
      }
    }

    res.json({
      leaderboard,
      myRank,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
