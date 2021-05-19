require("dotenv").config()

const amqp = require("amqplib");
const Vonage = require("@vonage/server-sdk");

const rabbitMqUrl = process.env.RABBITMQ_URL || "amqp://localhost";
const rabbitMqAdminsExchange = "admins";
const rabbitMqParametersExchange = "parameters";
const rabbitMqReconnectionTimeout = 5;
const rabbitMqUpdateAdminListTimeout = 60 * 5; // five minutes

let adminList = []

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

const initRabbitMq = async () => {

  let interval = null

  try {
    const connection = await amqp.connect(rabbitMqUrl);
    const channel = await connection.createChannel();

    channel.assertExchange(rabbitMqAdminsExchange, 'fanout', { durable: false })
    channel.assertExchange(rabbitMqParametersExchange, 'fanout', { durable: false })

    const {queue} = channel.assertQueue('', { durable: false, exclusive: true })

    channel.bindQueue(queue, rabbitMqAdminsExchange, '')
    channel.bindQueue(queue, rabbitMqParametersExchange, '')
    channel.consume(queue, onRabbitMqMessageReceived, { noAck: true })  

    const sendAdminListRequest = async () => {
      if(!channel) return

      const message = JSON.stringify({type: 'admin:request-list'})
      await channel.publish(rabbitMqAdminsExchange, '', Buffer.from(message))
      console.log('sent admin:request-list')
    }

    sendAdminListRequest()
    interval = setInterval(sendAdminListRequest, rabbitMqUpdateAdminListTimeout * 1000);
  } 
  catch (err) {
    console.warn(
      "Error connecting to rabbitmq service, retrying in %s seconds",
      rabbitMqReconnectionTimeout
    );
    clearInterval(interval)
    setTimeout(initRabbitMq, rabbitMqReconnectionTimeout * 1000);
  }
};

const onRabbitMqMessageReceived = async (msg) => {

  try{
    const { type, data } = JSON.parse(msg.content);

    switch (type) {

      case "admin:list":
        adminList = data;
        console.log(adminList);
        break;

      case "admin:updated":
        adminList = adminList.filter(admin => admin.username !== data.username)
        adminList.push(data)
        console.log(adminList)
        break;

      case "parameter:threshold-reached":
        const text = `Parameter ${data.type} of silo ${data.silo} (area ${data.area}) has reached threshold and is now at ${data.value}`
        adminList.forEach(admin => {
          if(admin.phone) sendSMS(admin.phone, text)
          if(admin.email) sendMail(admin.email, text)
        })
        break;

      case "admin:request-list":
        break;

      default:
        console.log("Received unknown message")
        break;
    }
  }
  catch(err){

    console.log(err)
    return err;
  }

}

const sendSMS = (to, text) => {
  vonage.message.sendSms("Sioux Silos", to, text, (err, resData) => {
    if (err) {
      console.log(err);
    } else {
      if (resData.messages[0]["status"] === "0") {
        console.log("SMS Message sent successfully.");
      } else {
        console.log(
          `SMS Message failed with error: ${resData.messages[0]["error-text"]}`
        );
      }
    }
  });
}

const sendMail = (to, text) => {
  //TODO: Implement
}

initRabbitMq()