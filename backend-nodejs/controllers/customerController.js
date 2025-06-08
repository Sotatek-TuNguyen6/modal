const Customer = require("../models/Customer");

// Get all customers
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ code: 1 });
    res.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Error fetching customers" });
  }
};

// Get a single customer by ID
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Error fetching customer" });
  }
};

// Create a new customer
exports.createCustomer = async (req, res) => {
  try {
    console.log("Creating customer with data:", req.body);

    // Create a new customer with auto-generated code
    const customer = new Customer({
      name: req.body.name,
      // code will be auto-generated in pre-save hook
    });

    console.log("Customer model before save:", customer);
    const savedCustomer = await customer.save();
    console.log("Saved customer:", savedCustomer);

    res.status(201).json(savedCustomer);
  } catch (error) {
    console.error("Error creating customer:", error);
    // Send detailed error message
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: `Validation error: ${error.message}`,
      });
    }
    res
      .status(500)
      .json({ error: "Error creating customer: " + error.message });
  }
};

// Update an existing customer
exports.updateCustomer = async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    console.log("Updating customer with ID:", req.params.id);
    console.log("Update data:", req.body);

    // Find the customer to get their existing data
    const existingCustomer = await Customer.findById(req.params.id);
    if (!existingCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Update only the name (keep the existing code)
    existingCustomer.name = req.body.name;
    // existingCustomer.email = req.body.email;
    // existingCustomer.phone = req.body.phone;

    const updatedCustomer = await existingCustomer.save();
    res.json(updatedCustomer);
  } catch (error) {
    console.error("Error updating customer:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid customer ID format" });
    }
    res.status(500).json({ error: "Error updating customer" });
  }
};

// Delete a customer
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ error: "Error deleting customer" });
  }
};
