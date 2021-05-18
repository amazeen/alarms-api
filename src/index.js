/***
 * Implementare richiesta utenti admin all'avvio
 * dovrà richiedere ogni tot la lista aggiornata
 *
 *
 *
 *
 */

require("dotenv").config({ path: __dirname + "/../.env" });
const amqp = require("amqplib");
const Vonage = require("@vonage/server-sdk");

const url = process.env.RABBITMQ_URL || "amqp://localhost";
const exchange = "admin";
const timeout = 5;

let connection = null;
let channel = null;

const init = async (queueType) => {
  connection = null;
  channel = null;

  try {
    connection = await amqp.connect(url);

    channel = await connection.createChannel();

    if (queueType === "admin:response") {
      const queue = "admin:response";
      await channel.assertQueue(queue);
      await channel.assertExchange(exchange, "fanout", { durable: false });
    }
  } catch (err) {
    console.warn(
      "Error connecting to rabbitmq service, retriyng in %s seconds",
      timeout
    );
    setTimeout(init, timeout * 1000);
  }
};

const sendAdminRequest = async () => {

  await init();

  if (!channel) return;

  const queue = "admin:request";
  await channel.assertQueue(queue);

  const msgToSend = "type: admin:request-list";

  try {
    await channel.sendToQueue(queue, Buffer.from(msgToSend));
    console.log("MESSAGE SENT");
  } catch (err) {
    return err;
  }
};
setInterval(async () => {
  sendAdminRequest();
  //console.log(await sendAdminRequest());
}, 1000 /** 60 * 5 */ /*5 Minutes*/);

/**
 *
 * Receive Admin Response
 *
 */
let responseData;
const receiveAdminResponse = async (queue) => {
 
  await init();

  if(!channel) return;

  // const queue = "admin:response";
  // await channel.assertQueue(queue);

  await channel.consume(queue, (msg) => {
    let { type, data } = JSON.parse(msg.content);

      try{
        switch (type) {
          case "admin:response-list":
            responseData = data;
            console.log(responseData);
            break;
          case "admin:updated":
            temp = data;
            responseData = responseData.filter((admin) => {
              return admin.username !== temp.username
            });
            break;
          default:
            console.log("No Type match founded")
            break;
        }
      }catch(err){
        return err;
      }

      console.log("Message Received");
  }, {
    noAck: true
  })
}
const queue = "admin:response"
receiveAdminResponse(queue);

/**
 *
 * Receive Threshold Reached
 *
 */
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

const from = process.env.VONAGE_BRAND_NAME;
const to = process.env.TO_NUMBER;

const opts = {
  type: "unicode",
};
const receiveThresholdReached = async () => {
  if(!channel) return;

  await channel.consume(
    queue,
    (msg) => {
      const { type, text } = JSON.parse(msg.content);
      try {
        if (type === "reading:threshold-reached") {
          responseData.forEach(admin => {
            vonage.message.sendSms(from, admin.number, text, (err, resData) => {
              if (err) {
                console.log(err);
              } else {
                if (resData.messages[0]["status"] === "0") {
                  console.log("Message sent successfully.");
                } else {
                  console.log(
                    `Message failed with error: ${resData.messages[0]["error-text"]}`
                  );
                }
              }
            });

          })
        }
      } catch (err) {
        console.log(err);
      }
    },
    {
      noAck: true,
    }
  );
}
receiveThresholdReached();