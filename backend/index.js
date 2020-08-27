/*
  dependencies
*/

  const express = require('express')
  const admin = require('firebase-admin')
  let inspect = require('util').inspect
  let Busboy = require('busboy');
  let path = require('path')
  let os = require('os')
  let fs = require('fs')
  let UUID = require('uuid-v4')
  let webpush = require('web-push')

/*
  config - express
*/

  const app = express()

/*
  config - firebase
*/

  const serviceAccount = require('./serviceAccountKey.json');
    
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "teguhig.appspot.com"
  });

  const db = admin.firestore();
  let bucket = admin.storage().bucket();

/*
  config - webpush
*/

  webpush.setVapidDetails(
    'mailto:test@test.com',
    'BLEwTIax2rmCgt3XN3aGDGb32S8TVNdJ-KRLhB1rEMcOhpcjIhj6ffJSscutuXJ6wmflJkySY-5MEOl8TGpVCbo', // public key
    'HIihh8wTaLwt65SoeZjF1sVet9vFD16NZ5kshzCyL1g' // private key
  );

/*
  endpoint - posts
*/

  app.get('/posts', (request, response) => {
    response.set('Access-Control-Allow-Origin', '*')

    let posts = []
    db.collection('posts').orderBy('date', 'desc').get().then(snapshot => {
      snapshot.forEach((doc) => {
        posts.push(doc.data())
      });
      response.send(posts)
    })
  })

/*
  endpoint - createPost
*/

  app.post('/createPost', (request, response) => {
    response.set('Access-Control-Allow-Origin', '*')

    let uuid = UUID()

    var busboy = new Busboy({ headers: request.headers });

    let fields = {}
    let fileData = {}
    let imageUrl

    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      console.log('File [' + fieldname + ']: filename: ' + filename + ', encoding: ' + encoding + ', mimetype: ' + mimetype);
      // /tmp/4564564-234234.png
      let filepath = path.join(os.tmpdir(), filename)
      file.pipe(fs.createWriteStream(filepath))
      fileData = { filepath, mimetype }
    });

    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      fields[fieldname] = val
    });

    busboy.on('finish', function() {
      
      bucket.upload(
        fileData.filepath,
        {
          uploadType: 'media',
          metadata: {
            metadata: {
              contentType: fileData.mimetype,
              firebaseStorageDownloadTokens: uuid
            }
          }
        },
        (err, uploadedFile) => {
          if (!err) {
            createDocument(uploadedFile)
          }
        }
      )

      function createDocument(uploadedFile) {
        imageUrl = `https://firebasestorage.googleapis.com/v0/b/${ bucket.name }/o/${ uploadedFile.name }?alt=media&token=${ uuid }`

        db.collection('posts').doc(fields.id).set({
          id: fields.id,
          caption: fields.caption,
          location: fields.location,
          date: parseInt(fields.date),
          imageUrl: imageUrl
        }).then(() => {
          sendPushNotification()
          response.send('Post added: ' + fields.id)
        })
      }

      function sendPushNotification() {
        let subscriptions = []
        db.collection('subscriptions').get().then(snapshot => {
          snapshot.forEach((doc) => {
            subscriptions.push(doc.data())
          });
          return subscriptions
        }).then(subscriptions => {
          subscriptions.forEach(subscription => {
            const pushSubscription = {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.keys.auth,
                p256dh: subscription.keys.p256dh
              }
            };
            let pushContent = {
              title: 'New Quasagram Post!',
              body: 'New Post Added! Check it out!',
              openUrl: '/#/',
              imageUrl: imageUrl
            }
            let pushContentStringified = JSON.stringify(pushContent)
            webpush.sendNotification(pushSubscription, pushContentStringified)
          })
        })
      }
    });

    request.pipe(busboy)
  })

/*
  endpoint - createSubscription
*/

app.post('/createSubscription', (request, response) => {
  response.set('Access-Control-Allow-Origin', '*')
  db.collection('subscriptions').add(request.query).then(docRef => {
    response.send({
      message: 'Subscription added!',
      postData: request.query
    })
  })
})

/*
  listen
*/

  app.listen(process.env.PORT || 3000)