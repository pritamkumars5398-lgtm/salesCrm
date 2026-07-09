require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const Setting = require("./src/lib/models/Setting").Setting;
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const settings = await Setting.find({});
  settings.forEach(s => console.log(s.key, s.value, typeof s.value));
  mongoose.connection.close();
});
