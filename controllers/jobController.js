import supabase from '../config/db.js';
import { handleError } from '../middleware/errorHandler.js';

/* ---------- Lightweight in-memory cache ---------- */
const cache = new Map();
const CACHE_TTL = 30_000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function invalidateJobCache() {
  for (const key of cache.keys()) {
    if (key.startsWith('jobs')) cache.delete(key);
  }
}

// Map DB row to API response format
const mapJob = (j) => ({
  _id: j.id,
  companyName: j.company_name,
  designation: j.designation,
  description: j.description,
  companyLogo: j.company_logo,
  companyLinkedin: j.company_linkedin,
  applyLink: j.apply_link,
  jobType: j.job_type,
  location: j.location,
  isActive: j.is_active,
  postedBy: j.posted_by,
  createdAt: j.created_at,
  updatedAt: j.updated_at,
});

// @desc    Get all active jobs (public)
// @route   GET /api/jobs
// @access  Public
export const getJobs = async (req, res) => {
  try {
    const cacheKey = 'jobs:active';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const { data: jobs, error } = await supabase
      .from('job_postings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const response = { jobs: jobs.map(mapJob) };
    setCache(cacheKey, response);
    res.json(response);
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};

// @desc    Get all jobs (admin - includes inactive)
// @route   GET /api/jobs/all
// @access  Private/Admin
export const getAllJobs = async (req, res) => {
  try {
    const { data: jobs, error } = await supabase
      .from('job_postings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ jobs: jobs.map(mapJob) });
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Public
export const getJobById = async (req, res) => {
  try {
    const { data: job, error } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json(mapJob(job));
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};

// @desc    Create job posting
// @route   POST /api/jobs
// @access  Private/Admin
export const createJob = async (req, res) => {
  try {
    const { companyName, designation, description, companyLogo, companyLinkedin, applyLink, jobType, location, isActive } = req.body;

    const { data: job, error } = await supabase
      .from('job_postings')
      .insert({
        company_name: companyName,
        designation,
        description: description || '',
        company_logo: companyLogo || '',
        company_linkedin: companyLinkedin || '',
        apply_link: applyLink,
        job_type: jobType || 'full-time',
        location: location || '',
        is_active: isActive !== undefined ? isActive : true,
        posted_by: req.admin?.id !== 'default' ? req.admin.id : null,
      })
      .select()
      .single();

    if (error) throw error;

    invalidateJobCache();
    res.status(201).json(mapJob(job));
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};

// @desc    Update job posting
// @route   PUT /api/jobs/:id
// @access  Private/Admin
export const updateJob = async (req, res) => {
  try {
    const { companyName, designation, description, companyLogo, companyLinkedin, applyLink, jobType, location, isActive } = req.body;

    const updates = {};
    if (companyName !== undefined) updates.company_name = companyName;
    if (designation !== undefined) updates.designation = designation;
    if (description !== undefined) updates.description = description;
    if (companyLogo !== undefined) updates.company_logo = companyLogo;
    if (companyLinkedin !== undefined) updates.company_linkedin = companyLinkedin;
    if (applyLink !== undefined) updates.apply_link = applyLink;
    if (jobType !== undefined) updates.job_type = jobType;
    if (location !== undefined) updates.location = location;
    if (isActive !== undefined) updates.is_active = isActive;
    updates.updated_at = new Date().toISOString();

    const { data: job, error } = await supabase
      .from('job_postings')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    invalidateJobCache();
    res.json(mapJob(job));
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};

// @desc    Delete job posting
// @route   DELETE /api/jobs/:id
// @access  Private/Admin
export const deleteJob = async (req, res) => {
  try {
    const { error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    invalidateJobCache();
    res.json({ message: 'Job posting deleted' });
  } catch (error) {
    handleError(res, error, 'jobController');
  }
};
