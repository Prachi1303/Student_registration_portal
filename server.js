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
            console.error('Database error fetching user details:', err);
            return res.status(500).send('Database error');
        }

        const userDetails = results[0] || {};
        res.render('dashboard', {
            email: req.session.user.email,
            userDetails: userDetails,
            message: 'Welcome to your dashboard!',
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

// Start server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
