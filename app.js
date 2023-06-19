const express = require("express");

const path = require("path");

const sqlite3 = require("sqlite3");

const { open } = require("sqlite");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,

      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000")
    );
  } catch (error) {
    console.log(`DB Error : '${error.message}'`);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;

  const { tweetId } = request.params;

  let jwtToken;

  const authHeader = request.header["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);

    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);

        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;

        request.tweetId = tweetId;

        request.tweet = tweet;

        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectUserQuery = `select * from user where username='${username}';`;

  console.log(username, password, name, gender);

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);

      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const createUserQuery = `INSERT INTO user(name,username,password,gender)

            VALUES('${name}','${username}','${hashedPassword}','${gender}');`;

      await db.run(createUserQuery);

      response.status(200);

      response.send("User created successfully");
    }
  } else {
    response.status(400);

    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;

  console.log(username, password);

  const dbUser = await db.get(selectUserQuery);

  console.log(dbUser);

  if (dbUser === undefined) {
    response.status(400);

    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(dbUser, "MY_SECRET_TOKEN");

      response.send({ jwtToken });
    } else {
      response.status(400);

      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  console.log(name);

  const getTweetSFeedQuery = `select username,tweet,date_time as dateTime from follower

    inner join tweet on follower.following_user_id=tweet.user_id INNER JOIN user on user.user_id=follower.following_user_id

    where follower.follower_user_id=${user_id} order by date_time DESC LIMIT 4 ;`;

  const tweetFeedArray = await db.all(getTweetSFeedQuery);
  response.send(tweetFeedArray);
});

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  console.log(name);

  const userFollowersQuery = `select name from user inner join follower on user.user_id=follower.follower_user_id

    where follower.following_user_id=${user_id};`;

  const userFollowingsArray = await db.all(userFollowersQuery);

  response.send(userFollowingsArray);
});

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  console.log(name, tweetId);

  const tweetQuery = `select * from tweet where tweet_id=${tweetId};`;

  const tweetResult = await db.get(tweetQuery);

  const userFollowersQuery = `select * from follower inner join user on user.user_id=follower.following_user_id

    where follower.follower_user_id=${user_id};`;

  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    console.log(tweetResult);

    console.log("----------");

    console.log(userFollowers);

    const getTweetDetailsQuery = `select tweet,

                                    count(DISTINCT(like.like_id)) as likes,

                                    count(DISTINCT(reply.reply_id)) as replies,

                                    tweet.date_time as dateTime

                                    from tweet inner join like on tweet.tweet_id=like.tweet_id inner join reply on reply.tweet_id=tweet.tweet_id

                                    where tweet.tweet_id=${tweetId} and tweet.user_id=${userFollowers[0].user_id};`;

    const tweetDetails = await db.get(getTweetDetailsQuery);

    response.send(tweetDetails);
  } else {
    response.status(401);

    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { payload } = request;

    const { user_id, name, username, gender } = payload;

    console.log(name, tweetId);

    const getLikedQuery = `select * from follower inner join tweet on tweet.user_id=follower.following_user_id inner join like on like.tweet_id=tweet.tweet_id

    inner join user on user.user_id=like.user_id

    where tweet.tweet_id=${tweetId} and follower_follower_user_id=${user_id};`;

    const likedUsers = await db.all(getLikedQuery);

    console.log(likedUsers);

    if (likedUsers.length !== 0) {
      let likes = [];

      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };

      getNamesArray(likedUsers);

      response.send({ likes });
    } else {
      response.status(401);

      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { payload } = request;

    const { user_id, name, username, gender } = payload;

    console.log(name, tweetId);

    const getRepliedUserQuery = `select * from follower inner join tweet on tweet.user_id=follower.following_user_id inner join reply on reply.tweet_id=tweet.tweet_id

    inner join user on user.user_id=reply.user_id

    where tweet.tweet_id=${tweetId} and follower.follower_user_id=${user_id};`;

    const repliedUsers = await db.all(getRepliedUserQuery);

    console.log(repliedUsers);

    if (repliedUsers.length !== 0) {
      let repliers = [];

      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,

            reply: item.reply,
          };

          replies.push(object);
        }
      };

      getNamesArray(repliedUsers);

      response.send({ replies });
    } else {
      response.status(401);

      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  console.log(name, user_id);

  const getTweetsDetailQuery = `select 

                                tweet.tweet as tweet,

                                count(DISTINCT(like.like_id)) as likes,

                                count(DISTINCT(reply.reply_id)) as replies,

                                tweet.date_time as dateTime

                                from user inner join tweet on user.user_id=tweet.user_id inner join like on like.tweet_id=tweet.tweet_id inner join reply on reply.tweet_id=tweet.tweet_id

                                where user.user_id=${user_id} group by tweet.tweet_id;`;

  const tweetDetails = await db.all(getTweetsDetailQuery);

  response.send(tweetDetails);
});

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { payload } = request;

  const { tweet } = request;

  const { user_id, name, username, gender } = payload;

  console.log(name, tweetId);

  const postTweetQuery = `INSERT INTO tweet (tweet,user_id) VALUES('${tweet}',${user_id});`;

  await db.run(postTweetQuery);

  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  const selectUserQuery = `select * from tweet where tweet.user_id=${user_id} and tweet.tweet_id=${tweetId};`;

  const tweetUser = await db.all(selectUserQuery);

  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `delete from tweet where tweet.user_id=${user_id} and 

        tweet.tweet_id=${tweetId};`;

    await db.run(deleteTweetQuery);

    response.send("Tweet Removed");
  } else {
    response.status(401);

    response.send("Invalid Request");
  }
});

module.exports = app;
