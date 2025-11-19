// index.js
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");

const knex = require("knex")({
  client: "pg",
  connection: {
    host: "localhost",
    user: "postgres",
    password: "admin",
    database: "users",
    port: 5432,
  },
});

const app = express();
const port = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public")); // for CSS/images later

app.use(
  session({
    secret: process.env.SESSION_SECRET || "byu-study-hub-super-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

// ==================== AUTH MIDDLEWARE ====================
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
};

// ==================== ROUTES ====================

// Home / Dashboard
app.get("/", (req, res) => {
  if (req.session.userId) {
    return res.render("index"); // logged-in dashboard
  }
  res.redirect("/login");
});

// ————— Login —————
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await knex("users").where({ email }).first();

    if (user && (await bcrypt.compare(password, user.password_hash))) {
      req.session.userId = user.id;
      req.session.userName = user.name || user.email.split("@")[0];
      return res.redirect("/");
    } else {
      return res.render("login", { error: "Invalid email or password" });
    }
  } catch (err) {
    console.error(err);
    return res.render("login", { error: "Server error – try again" });
  }
});

// ————— Register —————
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!email || !password) {
    return res.render("register", { error: "All fields are required" });
  }

  try {
    const existing = await knex("users").where({ email }).first();
    if (existing) {
      return res.render("register", { error: "Email already in use" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [id] = await knex("users")
      .insert({ name: name.trim() || null, email, password_hash })
      .returning("id");

    req.session.userId = id;
    req.session.userName = name || email.split("@")[0];
    return res.redirect("/");
  } catch (err) {
    console.error(err);
    return res.render("register", { error: "Registration failed" });
  }
});

// ————— Dashboard (protected) —————
app.get("/dashboard", requireLogin, (req, res) => {
  res.render("index");
});

// ————— Create Group —————
app.get("/create-group", requireLogin, async (req, res) => {
  const courses = await knex("courses").orderBy("course_code");
  res.render("create-group", { courses, error: null });
});

app.post("/create-group", requireLogin, async (req, res) => {
  const { name, course_code, description, meeting_time, location } = req.body;

  try {
    // Find or create the course
    let course = await knex("courses").where({ course_code }).first();
    if (!course) {
      const [id] = await knex("courses")
        .insert({ course_code, course_name: course_code })
        .returning("id");
      course = { id };
    }

    await knex("study_groups").insert({
      name,
      course_id: course.id,
      creator_id: req.session.userId,
      description,
      meeting_time,
      location,
    });

    res.redirect("/groups");
  } catch (err) {
    console.error(err);
    const courses = await knex("courses").orderBy("course_code");
    res.render("create-group", { courses, error: "Could not create group" });
  }
});

// ————— All Groups (with filter) —————
app.get("/groups", requireLogin, async (req, res) => {
  const courseFilter = req.query.course || "";

  let query = knex("study_groups")
    .join("courses", "study_groups.course_id", "courses.id")
    .leftJoin("users", "study_groups.creator_id", "users.id")
    .select(
      "study_groups.*",
      "courses.course_code",
      "users.name as creator_name"
    );

  if (courseFilter) {
    query = query.where("courses.course_code", "ilike", `%${courseFilter}%`);
  }

  const groups = await query.orderBy("study_groups.created_at", "desc");
  const allCourses = await knex("courses").orderBy("course_code");

  res.render("groups", {
    groups,
    allCourses,
    courseFilter,
    userName: req.session.userName,
  });
});

// ————— Logout —————
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// 404
app.use((req, res) => {
  res.status(404).send("<h1>404 – Page Not Found</h1><a href='/'>Home</a>");
});

// ==================== START SERVER ====================
app.listen(port, () => {
  console.log(`BYU Study Hub running at http://localhost:${port}`);
  console.log(`→ First time? Go to http://localhost:${port}/register`);
});