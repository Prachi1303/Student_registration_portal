const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();
const SECRET_KEY = 'your_session_secret_key';

// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'student',
    port: 3306,
});

// Connect to the database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up Handlebars
app.set('view engine', 'hbs');

const hbs = require('hbs');

// Register the 'eq' helper
hbs.registerHelper('eq', function(a, b) {
    return a === b ? true : false;  // Return true or false based on comparison
});



// Set up sessions
app.use(
    session({
        secret: SECRET_KEY,
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 1000 * 60 * 60 }, // 1-hour session lifespan
    })
);

// Set up file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});
const upload = multer({ storage: storage });

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const nodemailer = require('nodemailer');

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ayash0876@gmail.com', // Your email
        pass: 'hcmqitxoarqoiabv'   // Your email password or App-specific password
    }
});

// Function to send email
const sendEmail = (to, subject, text) => {
    const mailOptions = {
        from: 'ayash0876@gmail.com', // Your email address
        to: to,
        subject: subject,
        text: text,
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            console.log('Error sending email:', err);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
};



// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Render signup page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Signup route
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Database error during signup:', err);
            return res.status(500).send('Database error');
        }

        if (results.length > 0) {
            return res.render('signup', { error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], (err, result) => {
            if (err) {
                console.error('Database error during insert:', err);
                return res.status(500).send('Database error');
            }
            res.render('login', { success: 'Signup successful! Please log in.' });
        });
    });
});

// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        // Store user information in the session
        req.session.user = { id: user.id, email: user.email };
        res.redirect('/dashboard');
    });
});



// Dashboard route (protected)
app.get('/dashboard', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    // Get user details from the database
    db.query('SELECT * FROM user_details WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        const userDetails = results[0] || {};

        // Get semester registration request status
        db.query('SELECT status FROM semester_registration_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId], (err, results) => {
            if (err) {
                console.error('Error fetching semester registration status:', err);
                return res.status(500).send('Database error');
            }

            // Get the most recent registration request status
            const registrationStatus = results.length > 0 ? results[0].status : 'Not Requested';

            res.render('dashboard', {
                email: req.session.user.email,
                userDetails: userDetails,
                registrationStatus: registrationStatus, // Pass status to template
                message: 'Welcome to your dashboard!',
            });
        });
    });
});


// Render the update profile page (protected)
app.get('/update-profile', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    // Get user details from the database
    db.query('SELECT * FROM user_details WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user details for update:', err);
            return res.status(500).send('Database error');
        }

        const userDetails = results[0] || {};
        
        // Render the update profile page with the existing user details
        res.render('update', {
            email: req.session.user.email,
            userDetails: userDetails, // Pass existing user details to the form
        });
    });
});

// Update profile details route
app.post('/update', isAuthenticated, upload.single('profile_picture'), (req, res) => {
    const userId = req.session.user.id;
    const { name, branch, year, enrollment, mobile, email, dob, address } = req.body;
    const profilePicture = req.file ? req.file.filename : null;

    // Check if user details exist
    db.query('SELECT * FROM user_details WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user details for update:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            // Insert new profile if not found
            const insertQuery = `
                INSERT INTO user_details (user_id, name, branch, year, enrollment, mobile, email, dob, address, profile_picture)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(insertQuery, [userId, name, branch, year, enrollment, mobile, email, dob, address, profilePicture], (err) => {
                if (err) {
                    console.error('Error inserting user details:', err);
                    return res.status(500).send('Error updating profile');
                }
                res.redirect('/dashboard');
            });
        } else {
            // Update existing profile
            const updateQuery = `
                UPDATE user_details
                SET name = ?, branch = ?, year = ?, enrollment = ?, mobile = ?, email = ?, dob = ?, address = ?, profile_picture = ?
                WHERE user_id = ?
            `;
            db.query(updateQuery, [name, branch, year, enrollment, mobile, email, dob, address, profilePicture, userId], (err) => {
                if (err) {
                    console.error('Error updating user details:', err);
                    return res.status(500).send('Error updating profile');
                }
                res.redirect('/dashboard');
            });
        }
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).send('Logout error');
        }
        res.redirect('/login');
    });
});


// admin queries

const isAdminAuthenticated = (req, res, next) => {
    if (!req.session.admin) {
        return res.redirect('/admin-login');
    }
    next();
};

// Admin Login Page
app.get('/admin-login', (req, res) => {
    res.render('admin-login');
});

// Admin Login Route
app.post('/admin-login', (req, res) => {
    const { email, password } = req.body;

    if (email === 'admin@gmail.com' && password === 'admin') {
        req.session.admin = { email };
        res.redirect('/admin');
    } else {
        res.render('admin-login', { error: 'Invalid Admin Credentials' });
    }
});

// Admin Dashboard
app.get('/admin', isAdminAuthenticated, (req, res) => {
    db.query('SELECT * FROM user_details', (err, results) => {
        if (err) {
            console.error('Error fetching user details:', err);
            return res.status(500).send('Database error');
        }

        res.render('admin', {
            adminEmail: req.session.admin.email,
            users: results,
        });
    });
});

// Admin Logout Route
app.get('/admin-logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout error');
        }
        res.redirect('/admin-login');
    });
});


app.post('/semester-registration', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    // Get user details
    db.query('SELECT * FROM user_details WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error fetching user details:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            return res.status(400).send('User details not found.');
        }

        const { name, email } = results[0];

        // Insert request into the database
        const query = `
            INSERT INTO semester_registration_requests (user_id, name, email, status)
            VALUES (?, ?, ?, 'pending')
        `;
        db.query(query, [userId, name, email], (err) => {
            if (err) {
                console.error('Database error inserting registration request:', err);
                return res.status(500).send('Database error');
            }

            res.redirect('/dashboard');
        });
    });
});

app.get('/admin/notifications', (req, res) => {
    // Only allow admin access
    if (!req.session.admin) {
        return res.redirect('/admin-login');
    }

    // Fetch all pending requests
    const query = 'SELECT * FROM semester_registration_requests WHERE status = "pending"';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error fetching notifications:', err);
            return res.status(500).send('Database error');
        }

        res.json(results);
    });
});

app.post('/admin/handle-request', (req, res) => {
    const { requestId, action } = req.body;

    // Check if the action is valid
    if (action !== 'approved' && action !== 'denied') {
        return res.status(400).send('Invalid action');
    }

    // Get the request details from the database
    db.query('SELECT * FROM semester_registration_requests WHERE id = ?', [requestId], (err, results) => {
        if (err) {
            console.error('Error fetching registration request:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            return res.status(404).send('Request not found');
        }

        const request = results[0];
        const { user_id, name, email } = request;

        // Update the request status
        const newStatus = action === 'approved' ? 'Approved' : 'Denied';
        db.query('UPDATE semester_registration_requests SET status = ? WHERE id = ?', [newStatus, requestId], (err) => {
            if (err) {
                console.error('Error updating request status:', err);
                return res.status(500).send('Error updating request status');
            }

            // Send email to the user notifying them of the decision
            const subject = `Your Semester Registration Request ${newStatus}`;
            const text = `Hello ${name},\n\nYour semester registration request has been ${newStatus}.`;

            sendEmail(email, subject, text);

            // Send response to the admin
            res.send('Request handled and email sent');
        });
    });
});

// Route to fetch the number of pending notifications for the admin
app.get('/admin/notification-count', (req, res) => {
    db.query('SELECT COUNT(*) AS count FROM semester_registration_requests WHERE status = "pending"', (err, results) => {
        if (err) {
            console.error('Error fetching notification count:', err);
            return res.status(500).send('Database error');
        }

        const count = results[0].count;
        res.json({ count }); // Send back the count as a JSON response
    });
});


// Start server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
