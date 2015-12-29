var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

//authentication packages
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cookieParser('secret message'));
app.use(session( { //this hash removes deprecation warning
  secret: 'topsecret',
  saveUninitialized: true,
  resave: true}));

app.use(express.static(__dirname + '/public'));

var checkUser = function(req, res, next) {
  if (req.session.user) {
    console.log("user already logged in");
    next();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
};

app.get('/', checkUser,
function(req, res) {
  //res.redirect('/login');
  res.render('index');
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
  //res.redirect('/login');
});

app.get('/links', checkUser,
function(req, res) {
  //res.redirect('/login');
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin
        })
        .then(function(newLink) {
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  console.log("received post signup");
  var username = req.body.username;
  var password = req.body.password;
  bcrypt.hash(password, null, null, function(err, hash) {
    if (err) {
      console.log("error hashing password with bcrypt");
      throw err;
    }
    db.knex('users')
      .insert({ username: username,
                password: hash })
      .then(function() {
        req.session.regenerate(function() {
          req.session.user = username;
          res.redirect('/');
        });
      });
  })
});

app.post('/login', function(req, res) {
  //check if username and password matches in the users table
  //if yes, redirect to '/'
  //else stay on login page
  //res.render('signup');
  var username = req.body.username;
  var password = req.body.password;
  db.knex('users')
    .where('username', '=', username)
    .then(function(queryRes){
      if (queryRes[0]){
        var hashedPassword = queryRes[0].password;
        bcrypt.compare(password, hashedPassword, function(err, compareRes) {
          if (compareRes === true) { //user is valid
            req.session.regenerate(function() {
              req.session.user = username;
              res.redirect('/');
            });
          } else { //user is invalid (given password was incorrect)
            console.log("invalid password");
            res.redirect('/login');
          }
        });
      } else { //user is invalid (username doesn't exist in db)
        console.log("username doesn't exist in db");
        res.redirect('/login');
      }
    });
});

app.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.redirect('/');
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
