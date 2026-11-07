import UserDetails from "./UserDetails";
export default function Navbar({name}){
    return(
        <>
        <h1>Hello, Welcome to Navbar!</h1>
        <p> This is a simple Navbar component.</p>
        <UserDetails name={name}/>
        </>
        
    )
    
}
"use client";
import { createContext, useState } from "react";
// Create global context
export const UserContext = createContext();
export default function UserProvider({ children }) {
    const [name, setName] = useState("Srinivas");
    return (
        <UserContext.Provider value={{ name, setName }}>
            {children}
        </UserContext.Provider>
    );
}