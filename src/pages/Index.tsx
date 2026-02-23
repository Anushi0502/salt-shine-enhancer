import Ticker from "@/components/salt/Ticker";
import Topbar from "@/components/salt/Topbar";
import SaltSidebar from "@/components/salt/SaltSidebar";
import Hero from "@/components/salt/Hero";
import Collections from "@/components/salt/Collections";
import Spotlight from "@/components/salt/Spotlight";
import Products from "@/components/salt/Products";
import Benefits from "@/components/salt/Benefits";
import Newsletter from "@/components/salt/Newsletter";
import Footer from "@/components/salt/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Ticker />
      <Topbar />
      <SaltSidebar />
      <Hero />
      <Collections />
      <Spotlight />
      <Products />
      <Benefits />
      <Newsletter />
      <Footer />
    </div>
  );
};

export default Index;
