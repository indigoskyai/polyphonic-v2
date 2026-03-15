import React from "react";

interface PageTransitionProps {
  children: React.ReactNode;
  exiting?: boolean;
}

const PageTransition = ({ children, exiting }: PageTransitionProps) => (
  <div className={`min-h-screen ${exiting ? "page-transition-exit" : "page-transition-enter"}`}>
    {children}
  </div>
);

export default PageTransition;
