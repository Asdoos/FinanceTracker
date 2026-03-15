import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "sm" | "md";
}

export function Modal({ title, onClose, children, maxWidth = "sm" }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className={`bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full ${
          maxWidth === "md" ? "max-w-md" : "max-w-sm"
        } mx-4 max-h-[90vh] overflow-y-auto space-y-4`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="p-1 hover:bg-gray-800 rounded"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
