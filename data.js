/*
 * BASELINE CONTENT — used only when Supabase is NOT configured in config.js.
 * Mirrors the seed rows in schema.sql (same IDs).
 *
 * Every row here comes from the department's public VTU pages and is still
 * marked verification_status "pending". Nothing has been invented:
 * no intake numbers, placement figures, faculty, labs or events are filled in.
 * Unknown values are left null and shown on the site as "To verify".
 */
(function () {
  "use strict";
  var SRC = "Public VTU CSE department web page (vtu.ac.in) — reconfirm with department";
  function row(obj) {
    obj.status = "published";
    obj.verification_status = "pending";
    obj.source = SRC;
    obj.academic_year = obj.academic_year || null;
    obj.published_at = obj.published_at || "2026-11-26T00:00:00Z";
    obj.updated_at = obj.updated_at || "2026-11-26T00:00:00Z";
    return obj;
  }

  window.BASELINE = {
    dept_content: [
      row({
        id: "00000000-0000-4000-8000-000000000101",
        slug: "about",
        title: "About the Department",
        body:
          "The Department of Computer Science and Engineering is part of Visvesvaraya Technological University (VTU) at its Jnana Sangama campus in Belagavi, Karnataka.\n\n" +
          "The department's work covers engineering education, research, software development, consultancy and student-centred learning. Its published research activity spans artificial intelligence and intelligent systems, cloud computing, computer networks, computer vision and image processing, the Internet of Things and knowledge-based intelligent systems."
      }),
      row({
        id: "00000000-0000-4000-8000-000000000102",
        slug: "history",
        title: "History and Establishment",
        body: "The department was established in the academic year 2002–2003 at VTU's Jnana Sangama campus, Belagavi."
      })
    ],

    programmes: [
      row({ id: "00000000-0000-4000-8000-000000000201", code: "CSBS", name: "B.Tech in Computer Science and Business Systems", level: "UG", degree: "B.Tech", duration: "4 years", eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 10 }),
      row({ id: "00000000-0000-4000-8000-000000000202", code: "MTECH-CSE", name: "M.Tech in Computer Science and Engineering", level: "PG", degree: "M.Tech", duration: "2 years", eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 20 }),
      row({ id: "00000000-0000-4000-8000-000000000203", code: "MTECH-CNE", name: "M.Tech in Computer Network Engineering", level: "PG", degree: "M.Tech", duration: "2 years", eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 30 }),
      row({ id: "00000000-0000-4000-8000-000000000204", code: "MCA", name: "Master of Computer Applications", level: "PG", degree: "MCA", duration: "2 years", eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 40 }),
      row({ id: "00000000-0000-4000-8000-000000000205", code: "PHD-CSE", name: "Ph.D. in Computer Science and Engineering", level: "Research", degree: "Ph.D.", duration: null, eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 50 }),
      row({ id: "00000000-0000-4000-8000-000000000206", code: "MSC-ENGG", name: "M.Sc. (Engineering) by Research", level: "Research", degree: "M.Sc. (Engg)", duration: null, eligibility: null, intake: null, description: null, syllabus_url: null, sort_order: 60 })
    ],

    faculty: [
      row({
        id: "00000000-0000-4000-8000-000000000301",
        full_name: "Dr. S. A. Angadi",
        designation: "Chairperson",
        qualification: null,
        specialisation: null,
        experience: null,
        email: "chair.cse@vtu.ac.in",
        photo_url: null,
        research_interests: null,
        profile_url: null,
        memberships: null,
        responsibilities: "Chairperson, Department of Computer Science and Engineering",
        is_leadership: true,
        sort_order: 1
      })
    ],

    staff: [],

    research_areas: [
      row({ id: "00000000-0000-4000-8000-000000000401", name: "Artificial Intelligence and Intelligent Systems", description: "Machine learning, reasoning and intelligent decision-making systems.", sort_order: 10 }),
      row({ id: "00000000-0000-4000-8000-000000000402", name: "Cloud Computing", description: "Distributed infrastructure, virtualisation and cloud services.", sort_order: 20 }),
      row({ id: "00000000-0000-4000-8000-000000000403", name: "Computer Networks", description: "Network architecture, protocols, performance and security.", sort_order: 30 }),
      row({ id: "00000000-0000-4000-8000-000000000404", name: "Computer Vision and Image Processing", description: "Image analysis, recognition and visual understanding.", sort_order: 40 }),
      row({ id: "00000000-0000-4000-8000-000000000405", name: "Internet of Things (IoT)", description: "Connected devices, sensing and embedded systems.", sort_order: 50 }),
      row({ id: "00000000-0000-4000-8000-000000000406", name: "Knowledge-Based Intelligent Systems", description: "Knowledge representation and expert systems.", sort_order: 60 })
    ],

    publications: [],
    research_projects: [],
    ipr: [],
    research_scholars: [],
    laboratories: [],
    student_achievements: [],
    student_projects: [],
    student_clubs: [],
    placement_records: [],
    alumni: [],
    events: [],
    notices: [],
    documents: [],
    gallery: []
  };
})();
