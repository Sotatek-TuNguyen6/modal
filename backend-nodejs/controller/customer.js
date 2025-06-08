const Customer = require("../model/customer");

const createCustomer = async (req, res) => {
  const { name, folder } = req.body;
  const customer = await Customer.create({ name, folder });
  res.status(201).json(customer);
};

const getCustomers = async (req, res) => {
  const customers = await Customer.find();
  res.status(200).json(customers);
};

const getCustomerById = async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  res.status(200).json(customer);
};

const updateCustomer = async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json(customer);
};

const deleteCustomer = async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Customer deleted successfully" });
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};
