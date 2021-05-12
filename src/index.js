require('dotenv').config({ path: __dirname + '/../.env' })
const Vonage = require('@vonage/server-sdk')

const vonage = new Vonage({
    apiKey: process.env.VONAGE_API_KEY,
    apiSecret: process.env.VONAGE_API_SECRET
})

const from = process.env.VONAGE_BRAND_NAME
const to = process.env.TO_NUMBER

const opts = {
    "type": "unicode"
}


const amqp = require("amqplib/callback_api");
const io = require("socket.io")(process.env.PORT || 80, {
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log(socket);

    socket.on("silo:join", (silo) => {
        socket.join(silo);
    });

    socket.on("silo:leave", (silo) => {
        socket.leave(silo);
    });
});

amqp.connect(process.env.RABBITMQ_URL, (error0, connection) => {
    if (error0) {
        console.log(error0);
        //throw error0;
    }

    connection.createChannel((error1, channel) => {
        if (error1) {
            throw error1;
        }
        const queue = "hello";

        channel.assertQueue(queue, {
            durable: true
        });

        channel.consume(
            queue,
            (msg) => {

                const { type, text } = JSON.parse(msg.content);
                try {
                    if (type === "reading:threshold-reached") {
                        /*
                        io.to(msg.data.silo).emit("parameter:threshold-reached", {
                            type,
                            value: data.value,                                
                        });
                        */

                        vonage.message.sendSms(from, to, text, (err, responseData) => {

                            if (err) {
                                console.log(err);
                            } else {
                                if (responseData.messages[0]['status'] === "0") {
                                    console.log("Message sent successfully.");
                                } else {
                                    console.log(`Message failed with error: ${responseData.messages[0]['error-text']}`);
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.log(err);
                }
            },
            {
                noAck: true,
            }
        );
    });
});