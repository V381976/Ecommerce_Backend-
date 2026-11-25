const mongoose = require("mongoose");

// atomic sequences for human-friendly numbers (orders, tickets)
const CounterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", CounterSchema);

Counter.next = async (name, session) => {
  const c = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session }
  );
  return c.seq;
};

module.exports = Counter;
