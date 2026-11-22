import '../library.css';
import './chat.css';
export const metadata = {
  title: 'Chat · Absolute Memory',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
