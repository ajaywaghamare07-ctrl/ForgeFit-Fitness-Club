const express = require("express");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, "data");
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new sqlite3.Database(path.join(DB_DIR, "forgefit.db"));
const SQLiteStore = SQLiteStoreFactory(session);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: DB_DIR }),
  secret: process.env.SESSION_SECRET || "forgefit-demo-secret-change-before-deploy",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use("/assets", express.static(path.join(__dirname, "public")));

const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve(this)}));
const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)));
const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows)));
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const page = (title, body, active="") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | ForgeFit</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/assets/css/forgefit.css"></head><body>${body}<script src="/assets/js/app.js"></script></body></html>`;
const shell = (role, title, content, active) => page(title, `<div class="layout"><aside class="side"><a class="brand" href="/${role}"><b>F</b> forge<span>fit</span></a><p class="side-label">${role==="admin"?"ADMIN WORKSPACE":"MEMBER AREA"}</p><nav>${(role==="admin"?[["dashboard","▦","Dashboard"],["members","♙","Members"],["attendance","◷","Attendance"],["plans","▤","Plans"],["payments","₹","Payments"]]:[["dashboard","▦","My dashboard"],["workouts","✦","My workouts"],["attendance","◷","My attendance"],["profile","♙","My profile"]]).map(([url,icon,label])=>`<a class="${active===url?"selected":""}" href="/${role}/${url}"><i>${icon}</i>${label}</a>`).join("")}</nav><div class="side-bottom"><div class="signed"><div class="avatar">${esc(role==="admin"?"AD":"MB")}</div><div><b>${esc(role==="admin"?"Club Admin":"Member")}</b><small>${esc(role==="admin"?"Administrator":"Member account")}</small></div></div><form method="post" action="/logout"><button class="logout">↪ Sign out</button></form></div></aside><main class="main"><header class="top"><div><span class="muted">ForgeFit / </span><b>${esc(title)}</b></div><span class="role-pill">${role==="admin"?"ADMIN":"MEMBER"}</span></header><div class="content">${content}</div></main></div>`);
const stat = (label,value,sub="") => `<article class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
const table = (headers, rows) => `<div class="table-scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.join(""):`<tr><td colspan="${headers.length}" class="empty">No records yet.</td></tr>`}</tbody></table></div>`;
const notice = (req) => req.query.msg ? `<div class="notice">${esc(req.query.msg)}</div>` : "";
const requireRole = role => (req,res,next)=>req.session.user?.role===role?next():res.redirect(`/${role}/login`);
const adminOnly = requireRole("admin"), memberOnly = requireRole("member");

async function init(){
  await run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,phone TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS plans(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,duration_days INTEGER NOT NULL,price REAL NOT NULL,description TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS memberships(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,plan_id INTEGER NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT DEFAULT 'Active',FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(plan_id) REFERENCES plans(id))`);
  await run(`CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,checkin_at TEXT DEFAULT CURRENT_TIMESTAMP,visit_type TEXT DEFAULT 'Gym workout',FOREIGN KEY(user_id) REFERENCES users(id))`);
  await run(`CREATE TABLE IF NOT EXISTS exercise_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exercise TEXT NOT NULL,sets INTEGER NOT NULL,reps INTEGER NOT NULL,weight REAL,workout_date TEXT NOT NULL DEFAULT (date('now','localtime')),created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id))`);
  await run(`CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,amount REAL NOT NULL,payment_date TEXT DEFAULT CURRENT_TIMESTAMP,status TEXT DEFAULT 'Paid',note TEXT,FOREIGN KEY(user_id) REFERENCES users(id))`);
  const admin = await get("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if(!admin){
    const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD||"ChangeMe123!",10);
    await run("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",["Club Admin",process.env.ADMIN_EMAIL||"admin@forgefit.local",hash]);
  }
  const planCount=await get("SELECT COUNT(*) n FROM plans");
  if(!planCount.n){
    for(const p of [["Monthly",30,999,"Full gym access"],["Quarterly",90,2499,"Gym access + progress review"],["Yearly",365,8999,"All access + priority trainer support"]]) await run("INSERT INTO plans(name,duration_days,price,description) VALUES(?,?,?,?)",p);
  }
  const memberCount=await get("SELECT COUNT(*) n FROM users WHERE role='member'");
  if(!memberCount.n){
    const demo=[["Rohan Patil","rohan@demo.local","9876512340","Yearly"],["Priya Shetty","priya@demo.local","9876512341","Monthly"],["Arjun Rao","arjun@demo.local","9876512342","Quarterly"]];
    for(const [name,email,phone,planName] of demo){
      const hash=await bcrypt.hash("Member123!",10);
      const u=await run("INSERT INTO users(name,email,password,role,phone) VALUES(?,?,?,'member',?)",[name,email,hash,phone]);
      const p=await get("SELECT * FROM plans WHERE name=?",[planName]);
      const start=new Date(),end=new Date(start);end.setDate(end.getDate()+p.duration_days);
      const iso=d=>d.toISOString().slice(0,10);
      await run("INSERT INTO memberships(user_id,plan_id,start_date,end_date,status) VALUES(?,?,?,?,?)",[u.lastID,p.id,iso(start),iso(end),"Active"]);
      await run("INSERT INTO payments(user_id,amount,note) VALUES(?,?,?)",[u.lastID,p.price,"Demo membership payment"]);
    }
  }
}
function loginPage(role,error=""){
  const isAdmin=role==="admin";
  return page(`${isAdmin?"Admin":"Member"} login`,`<div class="login-wrap"><form class="login-card" method="post" action="/${role}/login"><a class="brand login-brand" href="/"><b>F</b> forge<span>fit</span></a><p class="eyebrow">${isAdmin?"CLUB MANAGEMENT":"YOUR FITNESS SPACE"}</p><h1>${isAdmin?"Admin sign in":"Member sign in"}</h1><p class="muted">${isAdmin?"Manage members, plans and club activity.":"Check your membership and gym activity."}</p>${error?`<div class="error">${esc(error)}</div>`:""}<label>Email<input name="email" type="email" required placeholder="name@example.com"></label><label>Password<input name="password" type="password" required placeholder="Enter password"></label><button class="btn full">Sign in →</button><p class="login-foot">${isAdmin?'Are you a member? <a href="/member/login">Member login</a>':'Gym administrator? <a href="/admin/login">Admin login</a>'}</p><a class="back-home" href="/">← Back to home</a></form></div>`);
}
app.get("/",(req,res)=>res.send(page("Welcome",`<div class="landing"><div class="landing-nav"><a class="brand" href="/"><b>F</b> forge<span>fit</span></a><nav class="landing-links" aria-label="Main navigation"><a href="#features">Platform</a><a href="#plans">Membership</a><a class="landing-login" href="/member/login">Member sign in <span aria-hidden="true">→</span></a></nav></div><section class="hero"><div class="hero-copy-wrap"><p class="eyebrow">BUILT FOR YOUR NEXT PERSONAL BEST</p><h1>Make strength<br>your <em>standard.</em></h1><p class="muted hero-copy">A better training experience starts with a club that keeps you moving. Find your plan, track every session, and build momentum that lasts.</p><div class="landing-actions"><a class="btn" href="/member/login">Start your journey <span aria-hidden="true">→</span></a><a class="btn outline" href="/admin/login">Club admin</a></div><p class="landing-note">One connected space for members and the people who make the club run.</p></div><div class="hero-art" aria-label="Fitness progress dashboard illustration"><div class="art-ring"></div><div class="art-card"><span>CONSISTENCY, ON REPEAT</span><b>07<span class="art-unit"> days</span></b><small>Your next streak starts today</small><div class="art-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="art-card-foot"><span>WEEKLY ACTIVITY</span><b>↗ Moving forward</b></div></div><div class="art-chip">✦ Show up for yourself</div></div></section><section class="landing-proof" id="features"><div><b>01</b><span>Plans that fit your pace</span></div><div><b>02</b><span>Progress you can see</span></div><div><b>03</b><span>A community that gets you</span></div></section><section class="landing-bottom" id="plans"><div><p class="eyebrow">YOUR SPACE TO GET STRONGER</p><h2>Every rep has a place here.</h2><p>Explore your membership, follow a training guide, and keep a record of the work you put in.</p></div><a class="btn" href="/member/login">Explore member portal <span aria-hidden="true">→</span></a></section><footer>FORGEFIT <span>TRAIN WITH INTENTION. GROW WITH EVERY SESSION.</span></footer></div>`)));
app.get("/admin/login",(req,res)=>res.send(loginPage("admin")));
app.post("/admin/login",async(req,res)=>{const u=await get("SELECT * FROM users WHERE email=? AND role='admin'",[req.body.email]);if(!u||!await bcrypt.compare(req.body.password,u.password))return res.status(401).send(loginPage("admin","Invalid email or password."));req.session.user={id:u.id,name:u.name,role:u.role};res.redirect("/admin");});
app.get("/member/login",(req,res)=>res.send(loginPage("member")));
app.post("/member/login",async(req,res)=>{const u=await get("SELECT * FROM users WHERE email=? AND role='member'",[req.body.email]);if(!u||!await bcrypt.compare(req.body.password,u.password))return res.status(401).send(loginPage("member","Invalid email or password."));req.session.user={id:u.id,name:u.name,role:u.role};res.redirect("/member");});
app.post("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));

app.get("/admin",adminOnly,(req,res)=>res.redirect("/admin/dashboard"));
app.get("/admin/dashboard",adminOnly,async(req,res)=>{
 const [members,active,today,rev,recent]=await Promise.all([
  get("SELECT COUNT(*) n FROM users WHERE role='member'"),
  get("SELECT COUNT(*) n FROM memberships WHERE status='Active'"),
  get("SELECT COUNT(*) n FROM attendance WHERE date(checkin_at)=date('now','localtime')"),
  get("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE strftime('%Y-%m',payment_date)=strftime('%Y-%m','now','localtime') AND status='Paid'"),
  all("SELECT u.name,u.email,p.name plan,m.status FROM users u LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN plans p ON p.id=m.plan_id WHERE u.role='member' ORDER BY u.id DESC LIMIT 6")
 ]);
 const rows=recent.map(m=>`<tr><td><b>${esc(m.name)}</b><small>${esc(m.email)}</small></td><td>${esc(m.plan||"—")}</td><td><span class="tag ${m.status==="Active"?"good":"warn"}">${esc(m.status||"No plan")}</span></td></tr>`);
 const content=`${notice(req)}<div class="heading"><div><p class="eyebrow">CLUB OVERVIEW</p><h1>Welcome back, ${esc(req.session.user.name)}</h1><p class="muted">Here’s your fitness club snapshot.</p></div><a class="btn" href="/admin/members/new">＋ Add member</a></div><div class="stats">${stat("Total members",members.n,"Registered member accounts")}${stat("Active memberships",active.n,"Currently active plans")}${stat("Today's check-ins",today.n,"Visits recorded today")}${stat("Revenue this month","₹"+Number(rev.n).toLocaleString("en-IN"),"Paid transactions")}</div><section class="panel"><div class="panel-head"><div><h2>Recently added members</h2><p class="muted">Latest member accounts</p></div><a href="/admin/members">View all →</a></div>${table(["MEMBER","PLAN","STATUS"],rows)}</section>`;
 res.send(shell("admin","Dashboard",content,"dashboard"));
});
app.get("/admin/members",adminOnly,async(req,res)=>{
 const data=await all("SELECT u.*,p.name plan,m.status,m.end_date FROM users u LEFT JOIN memberships m ON m.user_id=u.id LEFT JOIN plans p ON p.id=m.plan_id WHERE u.role='member' ORDER BY u.id DESC");
 const rows=data.map(m=>`<tr><td><b>${esc(m.name)}</b><small>${esc(m.email)}</small></td><td>${esc(m.phone||"—")}</td><td>${esc(m.plan||"—")}</td><td>${esc(m.end_date||"—")}</td><td><span class="tag ${m.status==="Active"?"good":"warn"}">${esc(m.status||"No plan")}</span></td></tr>`);
 const content=`${notice(req)}<div class="heading"><div><p class="eyebrow">PEOPLE</p><h1>Members</h1><p class="muted">Create and manage member accounts.</p></div><a class="btn" href="/admin/members/new">＋ Add member</a></div><section class="panel">${table(["MEMBER","PHONE","PLAN","PLAN ENDS","STATUS"],rows)}</section>`;
 res.send(shell("admin","Members",content,"members"));
});
app.get("/admin/members/new",adminOnly,async(req,res)=>{
 const plans=await all("SELECT * FROM plans ORDER BY price");
 const content=`<div class="heading"><div><p class="eyebrow">NEW ACCOUNT</p><h1>Add a member</h1><p class="muted">A separate member login will be created.</p></div></div><section class="panel form-panel"><form method="post" action="/admin/members"><div class="form-grid"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Phone<input name="phone"></label><label>Temporary password<input name="password" type="password" minlength="8" required></label><label>Membership plan<select name="plan_id" required>${plans.map(p=>`<option value="${p.id}">${esc(p.name)} — ₹${p.price}</option>`).join("")}</select></label></div><button class="btn">Create member account</button><a class="cancel" href="/admin/members">Cancel</a></form></section>`;
 res.send(shell("admin","Add member",content,"members"));
});
app.post("/admin/members",adminOnly,async(req,res)=>{
 const {name,email,phone,password,plan_id}=req.body;
 if(!name||!email||!password||password.length<8)return res.redirect("/admin/members/new?msg=Please+complete+all+required+fields");
 try{
  const hash=await bcrypt.hash(password,10),u=await run("INSERT INTO users(name,email,password,role,phone) VALUES(?,?,?,'member',?)",[name,email,hash,phone||""]);
  const plan=await get("SELECT * FROM plans WHERE id=?",[plan_id]);if(plan){const start=new Date(),end=new Date(start);end.setDate(end.getDate()+plan.duration_days);const iso=d=>d.toISOString().slice(0,10);await run("INSERT INTO memberships(user_id,plan_id,start_date,end_date,status) VALUES(?,?,?,?,?)",[u.lastID,plan.id,iso(start),iso(end),"Active"]);}
  res.redirect("/admin/members?msg=Member+account+created");
 }catch(e){res.redirect("/admin/members/new?msg=Email+already+exists+or+invalid+data");}
});
app.get("/admin/attendance",adminOnly,async(req,res)=>{
 const data=await all("SELECT a.*,u.name FROM attendance a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100");
 const rows=data.map(a=>`<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.visit_type)}</td><td>${esc(new Date(a.checkin_at+" UTC").toLocaleString("en-IN"))}</td></tr>`);
 const content=`<div class="heading"><div><p class="eyebrow">DAILY ACTIVITY</p><h1>Attendance</h1><p class="muted">Check-ins recorded by members or admin.</p></div></div><section class="panel">${table(["MEMBER","VISIT TYPE","CHECK-IN TIME"],rows)}</section>`;
 res.send(shell("admin","Attendance",content,"attendance"));
});
app.get("/admin/plans",adminOnly,async(req,res)=>{
 const plans=await all("SELECT p.*,(SELECT COUNT(*) FROM memberships m WHERE m.plan_id=p.id AND m.status='Active') members FROM plans p ORDER BY price");
 const cards=plans.map(p=>`<article class="plan-card"><span class="tag good">${p.duration_days} days</span><h2>${esc(p.name)}</h2><strong>₹${Number(p.price).toLocaleString("en-IN")}</strong><p class="muted">${esc(p.description||"Membership access")}</p><hr><b>${p.members} active members</b></article>`).join("");
 res.send(shell("admin","Plans",`<div class="heading"><div><p class="eyebrow">PRICING & ACCESS</p><h1>Membership plans</h1><p class="muted">Available membership options.</p></div></div><div class="plan-grid">${cards}</div>`,"plans"));
});
app.get("/admin/payments",adminOnly,async(req,res)=>{
 const data=await all("SELECT pay.*,u.name FROM payments pay JOIN users u ON u.id=pay.user_id ORDER BY pay.id DESC");
 const rows=data.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>₹${Number(p.amount).toLocaleString("en-IN")}</td><td>${esc(new Date(p.payment_date+" UTC").toLocaleDateString("en-IN"))}</td><td><span class="tag good">${esc(p.status)}</span></td></tr>`);
 res.send(shell("admin","Payments",`<div class="heading"><div><p class="eyebrow">FINANCE</p><h1>Payments</h1><p class="muted">Membership payment records.</p></div></div><section class="panel">${table(["MEMBER","AMOUNT","DATE","STATUS"],rows)}</section>`,"payments"));
});

app.get("/member",memberOnly,(req,res)=>res.redirect("/member/dashboard"));
app.get("/member/dashboard",memberOnly,async(req,res)=>{
 const u=req.session.user;
 const [membership,visits,payment,training]=await Promise.all([
  get("SELECT m.*,p.name plan,p.description FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.user_id=? ORDER BY m.id DESC LIMIT 1",[u.id]),
  get("SELECT COUNT(*) n FROM attendance WHERE user_id=?",[u.id]),
  get("SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 1",[u.id]),
  get("SELECT COUNT(*) n FROM exercise_logs WHERE user_id=? AND date(workout_date)>=date('now','localtime','-6 days')",[u.id])
 ]);
 const content=`<div class="heading"><div><p class="eyebrow">MEMBER SPACE</p><h1>Hello, ${esc(u.name.split(" ")[0])} 👋</h1><p class="muted">Your fitness journey, all in one place.</p></div></div><div class="stats">${stat("My membership",membership?.plan||"Not assigned",membership?.status||"Contact the club")}${stat("Total visits",visits.n,"Recorded gym check-ins")}${stat("Latest payment",payment?"₹"+Number(payment.amount).toLocaleString("en-IN"):"—",payment?.status||"No payment record")}${stat("Exercises logged",training.n,"Sets tracked in the last 7 days")}</div><section class="panel member-plan"><p class="eyebrow">CURRENT MEMBERSHIP</p><h2>${esc(membership?.plan||"No active plan")}</h2><p class="muted">${esc(membership?.description||"Please contact the club administrator to select a plan.")}</p>${membership?`<div class="plan-dates"><div><small>START DATE</small><b>${esc(membership.start_date)}</b></div><div><small>VALID UNTIL</small><b>${esc(membership.end_date)}</b></div><div><small>STATUS</small><b class="tag good">${esc(membership.status)}</b></div></div>`:""}</section><div class="member-actions"><a class="panel action-card" href="/member/attendance"><span>◷</span><b>My attendance</b><small>View your visit history →</small></a><a class="panel action-card" href="/member/workouts"><span>✦</span><b>Workout guide &amp; tracker</b><small>Plan sessions and log sets →</small></a></div>`;
 res.send(shell("member","My dashboard",content,"dashboard"));
});
app.get("/member/attendance",memberOnly,async(req,res)=>{
 const data=await all("SELECT * FROM attendance WHERE user_id=? ORDER BY id DESC",[req.session.user.id]);
 const rows=data.map(a=>`<tr><td>${esc(a.visit_type)}</td><td>${esc(new Date(a.checkin_at+" UTC").toLocaleString("en-IN"))}</td></tr>`);
 const content=`<div class="heading"><div><p class="eyebrow">MY ACTIVITY</p><h1>My attendance</h1><p class="muted">Your recorded visits to the club.</p></div><form method="post" action="/member/checkin"><button class="btn">＋ Check in now</button></form></div><section class="panel">${table(["VISIT TYPE","CHECK-IN TIME"],rows)}</section>`;
 res.send(shell("member","My attendance",content,"attendance"));
});
app.post("/member/checkin",memberOnly,async(req,res)=>{
 const m=await get("SELECT id FROM memberships WHERE user_id=? AND status='Active' ORDER BY id DESC LIMIT 1",[req.session.user.id]);
 if(!m)return res.redirect("/member/attendance?msg=No+active+membership");
 await run("INSERT INTO attendance(user_id,visit_type) VALUES(?,?)",[req.session.user.id,"Gym workout"]);
 res.redirect("/member/attendance?msg=Check-in+recorded");
});
const workoutPlans=[
 {day:"Monday",name:"Upper body",focus:"Chest · Back · Shoulders",exercises:["Barbell bench press","One-arm dumbbell row","Dumbbell shoulder press"]},
 {day:"Tuesday",name:"Lower body",focus:"Quads · Hamstrings · Glutes",exercises:["Goblet squat","Romanian deadlift","Reverse lunge"]},
 {day:"Wednesday",name:"Active recovery",focus:"Mobility · Easy walk",exercises:["Brisk walk","Hip mobility","Thoracic rotation"]},
 {day:"Thursday",name:"Full body",focus:"Compound movement basics",exercises:["Dumbbell deadlift","Push-up","Dumbbell row"]},
 {day:"Friday",name:"Core & conditioning",focus:"Core stability · Cardio",exercises:["Plank","Dead bug","Bike intervals"]}
];
const exerciseOptions=[...new Set(workoutPlans.flatMap(plan=>plan.exercises))];
app.get("/member/workouts",memberOnly,async(req,res)=>{
 const logs=await all("SELECT exercise,sets,reps,weight,workout_date FROM exercise_logs WHERE user_id=? ORDER BY workout_date DESC,id DESC LIMIT 30",[req.session.user.id]);
 const week=await get("SELECT COUNT(*) n FROM exercise_logs WHERE user_id=? AND date(workout_date)>=date('now','localtime','-6 days')",[req.session.user.id]);
 const rows=logs.map(log=>`<tr><td><b>${esc(log.exercise)}</b></td><td>${esc(log.sets)} × ${esc(log.reps)}</td><td>${log.weight===null?"—":`${esc(log.weight)} kg`}</td><td>${esc(log.workout_date)}</td></tr>`);
 const cards=workoutPlans.map(plan=>`<article class="panel workout"><span class="tag good">${esc(plan.day)}</span><h2>${esc(plan.name)}</h2><p class="muted">${esc(plan.focus)}</p><ul>${plan.exercises.map(exercise=>`<li>${esc(exercise)}</li>`).join("")}</ul></article>`).join("");
 const content=`${notice(req)}<div class="heading"><div><p class="eyebrow">TRAINING</p><h1>Workout guide &amp; tracker</h1><p class="muted">Follow a sample plan, then log your sets to keep your progress in one place.</p></div><span class="tag good">${week.n} exercises · last 7 days</span></div><div class="workout-grid">${cards}</div><div class="tracking-layout"><section class="panel form-panel"><div class="panel-head"><div><h2>Log an exercise</h2><p class="muted">Record the work you completed today.</p></div></div><form method="post" action="/member/workouts"><div class="form-grid"><label>Exercise<select name="exercise" required>${exerciseOptions.map(exercise=>`<option value="${esc(exercise)}">${esc(exercise)}</option>`).join("")}</select></label><label>Sets<input name="sets" type="number" min="1" max="20" value="3" required></label><label>Reps per set<input name="reps" type="number" min="1" max="100" value="10" required></label><label>Weight (kg, optional)<input name="weight" type="number" min="0" max="1000" step="0.5" placeholder="Leave blank if bodyweight"></label></div><button class="btn" type="submit">＋ Save exercise</button></form></section><section class="panel log-panel"><div class="panel-head"><div><h2>Recent exercise log</h2><p class="muted">Your latest 30 entries</p></div></div>${table(["EXERCISE","SETS × REPS","WEIGHT","DATE"],rows)}</section></div><p class="muted disclaimer">Sample routines are general guidance, not individualized medical or training advice. Choose appropriate loads and ask a qualified trainer for support.</p>`;
 res.send(shell("member","My workouts",content,"workouts"));
});
app.post("/member/workouts",memberOnly,async(req,res)=>{
 const exercise=String(req.body.exercise||"");
 const sets=Number(req.body.sets),reps=Number(req.body.reps);
 const weightValue=String(req.body.weight||"").trim();
 const weight=weightValue===""?null:Number(weightValue);
 if(!exerciseOptions.includes(exercise)||!Number.isInteger(sets)||sets<1||sets>20||!Number.isInteger(reps)||reps<1||reps>100||(weight!==null&&(!Number.isFinite(weight)||weight<0||weight>1000))){
  return res.redirect("/member/workouts?msg=Enter+a+valid+exercise%2C+set%2C+rep+and+weight");
 }
 try{
  await run("INSERT INTO exercise_logs(user_id,exercise,sets,reps,weight) VALUES(?,?,?,?,?)",[req.session.user.id,exercise,sets,reps,weight]);
  return res.redirect("/member/workouts?msg=Exercise+saved+to+your+training+log");
 }catch(error){
  console.error("Could not save member exercise log:",error);
  return res.status(500).send(page("Workout log error",`<div class="login-wrap"><div class="login-card"><h1>Could not save exercise</h1><p class="muted">Your log was not saved. Please try again.</p><a class="btn" href="/member/workouts">Return to workouts</a></div></div>`));
 }
});
app.get("/member/profile",memberOnly,async(req,res)=>{
 const u=await get("SELECT name,email,phone,created_at FROM users WHERE id=?",[req.session.user.id]);
 const content=`<div class="heading"><div><p class="eyebrow">ACCOUNT</p><h1>My profile</h1><p class="muted">Your registered member information.</p></div></div><section class="panel profile-panel"><div class="profile-large">${esc(u.name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase())}</div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)}</p><hr><p><b>Phone:</b> ${esc(u.phone||"Not provided")}</p><p><b>Member since:</b> ${esc(u.created_at)}</p></section>`;
 res.send(shell("member","My profile",content,"profile"));
});
app.use((req,res)=>res.status(404).send(page("Not found",`<div class="login-wrap"><div class="login-card"><h1>Page not found</h1><a href="/">Return home</a></div></div>`)));
init().then(()=>app.listen(PORT,()=>console.log(`ForgeFit running at http://localhost:${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
