const UserModal = require("../model/user")
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


const createUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserModal.create({ name, email, password: hashedPassword, role });
    res.status(201).json({ message: "User created successfully", user });
};

const getAllUsers = async (req, res) => {
    const users = await UserModal.find();
    res.status(200).json({ users });
};

const getUserById = async (req, res) => {   
    const { id } = req.params;
    const user = await UserModal.findById(id);
    res.status(200).json({ user });
};


const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role } = req.body;
    const user = await UserModal.findByIdAndUpdate(id, { name, email, password, role }, { new: true });
    res.status(200).json({ message: "User updated successfully", user });
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;
    const user = await UserModal.findOne({ email });
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.status(200).json({ message: "Login successful", token });
};

const registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserModal.create({ name, email, password: hashedPassword, role });
    res.status(201).json({ message: "User created successfully", user });
};

const refreshToken = async (req, res) => {  
    const { refreshToken } = req.body;
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await UserModal.findById(decoded.id);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.status(200).json({ message: "Token refreshed", token });
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    await UserModal.findByIdAndDelete(id);
    res.status(200).json({ message: "User deleted successfully" });
};
    
module.exports = { createUser, getAllUsers, getUserById, updateUser, loginUser, registerUser, refreshToken, deleteUser }; 