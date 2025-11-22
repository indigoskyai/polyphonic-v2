import { ReactNode } from "react";

interface PhoneContainerProps {
  children: ReactNode;
}

export const PhoneContainer = ({ children }: PhoneContainerProps) => {
  return (
    <div className="relative w-[390px] h-[844px] bg-gradient-to-br from-gray-700 to-gray-800 rounded-[42px] p-3 shadow-2xl">
      <div className="absolute top-[50px] left-1/2 -translate-x-1/2 w-[140px] h-[5px] bg-black rounded-full z-20" />
      
      <div className="w-full h-full bg-black rounded-[30px] overflow-hidden relative flex flex-col">
        <div className="h-11 bg-transparent flex items-center justify-between px-6 text-white text-xs font-semibold z-10">
          <span>9:41</span>
          <span className="font-mono tracking-[2px] opacity-80">POLYPHONIC</span>
          <span>⚡︎ 5G</span>
        </div>
        
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
};
