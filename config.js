/*
 * SITE CONFIGURATION — the only file you must edit before going live.
 *
 * 1. SUPABASE_URL / SUPABASE_ANON_KEY
 *    Supabase dashboard -> Project Settings -> API Keys. Use the PUBLISHABLE key
 *    (sb_publishable_...) or the legacy anon key. NEVER the secret key (sb_secret_...).
 *    The anon key is PUBLIC by design. Security comes from the Row Level
 *    Security policies in schema.sql, not from hiding this key.
 *    NEVER put the service_role key in this file.
 *    Leave both empty to run the site on the built-in baseline content (data.js).
 *
 * 2. If you use a custom Supabase domain (not *.supabase.co), add it to the
 *    Content-Security-Policy "connect-src" in vercel.json, or every request will be blocked.
 */
window.SITE_CONFIG = {
  SUPABASE_URL: "https://jsuyshliihapszqpkary.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_i250wBuQU9n3DLYrIxKnXg_MtEiev8D",
  STORAGE_BUCKET: "dept-public",
  MAX_UPLOAD_MB: 10,

  /* Shows a notice on every page that this is an unofficial prototype.
     Set to false ONLY after the department has formally approved the site. */
  PROTOTYPE_MODE: true,
  PROTOTYPE_NOTICE:
    "Independent prototype for departmental review. Content is drawn from public VTU pages and is pending verification by the Department of CSE. This is not the official VTU website.",

  /* Official logo: leave empty until VTU provides approved logo files and brand guidelines. */
  LOGO_URL: "",
  /* Authentic campus/department photograph for the home page hero (optional). */
  HERO_IMAGE_URL: "",
  HERO_IMAGE_ALT: "",

  /* Institutional facts used in the header, footer and contact page. */
  DEPT: {
    name: "Department of Computer Science and Engineering",
    shortName: "CSE",
    university: "Visvesvaraya Technological University",
    campus: "Jnana Sangama, Belagavi",
    addressLines: [
      "Department of Computer Science and Engineering",
      "Visvesvaraya Technological University",
      "Jnana Sangama, Belagavi – 590018",
      "Karnataka, India"
    ],
    email: "chair.cse@vtu.ac.in",
    phone: "",
    established: "Academic year 2002–2003",
    tagline: "Innovate. Research. Engineer the Future.",
    universityUrl: "https://vtu.ac.in"
  },

  /* Footer credit. Set to "" to remove. */
  DEVELOPER_CREDIT: "Prototype developed by INERA GROUP (Inera Software Pvt. Ltd.)"
};
