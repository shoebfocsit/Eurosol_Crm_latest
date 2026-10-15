import React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/button';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { AppImage } from './AppImage';
import { resolveImageUrl } from '../lib/utils';

interface ProfileCardProps {
  employee: {
    name: string;
    email: string;
    phone?: string;
    role: string;
    profilePic?: string;
    joiningDate?: string;
    employeeId?: string;
    isSuperAdmin?: boolean;
  };
  onClose?: () => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ employee, onClose }) => {
  const loadPhoto = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('photo load failed'));
      img.src = src;
    });

  // Draws the ID card natively with jsPDF (no DOM screenshot — html2canvas
  // cannot parse Tailwind v4 oklch colors and cross-origin photos taint canvas).
  const downloadPDF = async () => {
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const cardW = 120;
      const cardH = 78;
      const cardX = (pageW - cardW) / 2;
      const cardY = (pageH - cardH) / 2;

      // Card background + border
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'F');

      // Navy header
      pdf.setFillColor(27, 42, 74);
      pdf.roundedRect(cardX, cardY, cardW, 24, 3, 3, 'F');
      pdf.rect(cardX, cardY + 18, cardW, 6, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text('EuroSol Prime', cardX + 7, cardY + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(190, 210, 235);
      pdf.text('Employee ID Card', cardX + 7, cardY + 15.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(52, 211, 153);
      pdf.text('VALID ID', cardX + cardW - 7, cardY + 10, { align: 'right' });

      // Photo (falls back to initial if it cannot be loaded CORS-clean)
      const photoX = cardX + 8;
      const photoY = cardY + 29;
      const photoS = 22;
      let photoDrawn = false;
      if (employee.profilePic) {
        try {
          const img = await loadPhoto(resolveImageUrl(employee.profilePic));
          pdf.addImage(img, 'JPEG', photoX, photoY, photoS, photoS);
          photoDrawn = true;
        } catch { /* fall through to initial */ }
      }
      if (!photoDrawn) {
        pdf.setFillColor(27, 42, 74);
        pdf.rect(photoX, photoY, photoS, photoS, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text((employee.name?.charAt(0) || 'U').toUpperCase(), photoX + photoS / 2, photoY + photoS / 2 + 4.5, { align: 'center' });
      }
      pdf.setDrawColor(16, 185, 129);
      pdf.setLineWidth(0.8);
      pdf.rect(photoX, photoY, photoS, photoS, 'D');

      // Name + role
      const textX = photoX + photoS + 5;
      pdf.setTextColor(20, 20, 20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text(employee.name || '—', textX, photoY + 7, { maxWidth: cardW - (textX - cardX) - 6 });
      pdf.setFillColor(27, 42, 74);
      const roleLabel = employee.role?.replace(/_/g, ' ') || 'Team Member';
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const roleW = pdf.getTextWidth(roleLabel) + 8;
      pdf.roundedRect(textX, photoY + 11, Math.min(roleW, 70), 6.5, 3, 3, 'F');
      pdf.text(roleLabel, textX + 4, photoY + 15.5, { maxWidth: 62 });
      if (employee.isSuperAdmin) {
        pdf.setTextColor(16, 185, 129);
        pdf.text('Super Admin', textX, photoY + 21.5);
      }

      // Info rows
      const empId = employee.employeeId || employee.email?.split('@')[0]?.toUpperCase() || '—';
      const rows: Array<[string, string]> = [
        ['Employee ID', String(empId).slice(0, 24)],
        ['Email', employee.email || '—'],
        ['Phone', employee.phone || '—'],
        ['Joining Date', joinDate],
      ];
      const gridY = cardY + 56;
      const colW = (cardW - 14) / 2;
      rows.forEach(([label, value], i) => {
        const cx = cardX + 7 + (i % 2) * colW;
        const cy = gridY + Math.floor(i / 2) * 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(label.toUpperCase(), cx, cy);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 30, 30);
        pdf.text(value, cx, cy + 4, { maxWidth: colW - 2 });
      });

      // Footer strip
      pdf.setFillColor(16, 185, 129);
      pdf.rect(cardX, cardY + cardH - 7, cardW, 7, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(`© ${new Date().getFullYear()} EuroSol Prime`, cardX + 5, cardY + cardH - 2.5);
      pdf.text('eurosolservice.com', cardX + cardW - 5, cardY + cardH - 2.5, { align: 'right' });

      // Outer border on top
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'D');

      pdf.save(`${employee.name.replace(/\s+/g, '_')}_ID_Card.pdf`);
      toast.success('ID Card downloaded as PDF');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const joinDate = employee.joiningDate
    ? new Date(employee.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="relative max-w-md w-full" onClick={e => e.stopPropagation()}>
        {/* Download button */}
        <div className="flex justify-end mb-3 gap-2">
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="bg-card/80 hover:bg-card text-stone-600 rounded-full h-9 w-9">
              <X size={18} />
            </Button>
          )}
          <Button onClick={downloadPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg">
            <Download size={16} /> Download PDF
          </Button>
        </div>

        {/* ID Card */}
        <div
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-50 to-stone-100 p-1"
          style={{
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.1), inset 0 1px 2px rgba(255,255,255,0.7)',
          }}
        >
          {/* Inner card */}
          <div className="rounded-xl bg-card overflow-hidden" style={{ boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.05)' }}>
            {/* Navy blue header */}
            <div className="bg-[#1B2A4A] px-6 py-5 text-white relative overflow-hidden">
              <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)' }} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">EP</div>
                    <div>
                      <p className="font-bold text-lg leading-tight tracking-tight">EuroSol Prime</p>
                      <p className="text-[10px] text-blue-200/80 font-medium">Employee ID Card</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-blue-200/60 uppercase tracking-widest">Valid ID</p>
                  <div className="w-10 h-10 rounded-full border-2 border-emerald-400/50 flex items-center justify-center mt-0.5 ml-auto">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                  </div>
                </div>
              </div>
            </div>

            {/* Employee photo + name section */}
            <div className="px-6 pt-0 pb-4 relative">
              {/* Profile image - overlaps header */}
              <div className="flex justify-center -mt-10 mb-3 relative z-10">
                <div className="w-24 h-24 rounded-2xl border-4 border-white overflow-hidden shadow-xl" style={{ boxShadow: '0 8px 25px rgba(0,0,0,0.12)' }}>
                  {employee.profilePic ? (
                    <AppImage src={employee.profilePic} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1B2A4A] to-stone-700 flex items-center justify-center text-white text-3xl font-bold">
                      {employee.name?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
              </div>

              {/* Name + role */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-stone-900">{employee.name}</h2>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[#1B2A4A] text-white">
                    {employee.role?.replace(/_/g, ' ') || 'Team Member'}
                  </span>
                  {employee.isSuperAdmin && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Super Admin
                    </span>
                  )}
                </div>
              </div>

              {/* Info grid with claymorphism cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Employee ID', value: employee.employeeId || employee.email?.split('@')[0]?.toUpperCase() || '—' },
                  { label: 'Email', value: employee.email },
                  { label: 'Phone', value: employee.phone || '—' },
                  { label: 'Joining Date', value: joinDate },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 bg-stone-50 border border-stone-100/80"
                    style={{ boxShadow: '4px 4px 10px rgba(0,0,0,0.03), -2px -2px 6px rgba(255,255,255,0.8), inset 0 1px 0 rgba(255,255,255,0.9)' }}
                  >
                    <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-semibold text-stone-800 mt-0.5 truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Bottom company strip */}
              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                <span>© {new Date().getFullYear()} EuroSol Prime</span>
                <span className="text-emerald-600 font-medium">eurosolservice.com</span>
              </div>
            </div>

            {/* Decorative bottom bar */}
            <div className="h-1.5 bg-gradient-to-r from-[#1B2A4A] via-emerald-500 to-[#1B2A4A]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;
