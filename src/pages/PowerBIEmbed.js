import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import * as powerbi from "powerbi-client";

const PowerBIEmbed = () => {
  const [embedToken, setEmbedToken] = useState("");
  const [report, setReport] = useState(null);
  const embedRef = useRef(null);

  // ดึง embed token จาก backend
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await axios.get("http://localhost:5000/get-token");
        console.log("✅ Embed Token:", response.data.access_token);
        setEmbedToken(response.data.access_token);
      } catch (error) {
        console.error("❌ Error fetching token:", error);
      }
    };

    fetchToken();
  }, []);

  // embed report เมื่อได้ token และ embedRef พร้อม
  useEffect(() => {
    if (embedToken && embedRef.current) {
      const embedConfig = {
        type: "report",
        tokenType: powerbi.models.TokenType.Aad, // เปลี่ยนเป็น Embed ถ้าใช้ embed token
        accessToken: embedToken,
        embedUrl:
          "https://app.powerbi.com/reportEmbed?reportId=472ce188-b413-4850-9589-7c0e9c1c4bba&groupId=57d695d4-ad86-44d3-9c95-7176deacf03d",
        settings: {
          filterPaneEnabled: false,
          navContentPaneEnabled: false,
        },
      };

      const powerbiService = new powerbi.service.Service(
        powerbi.factories.hpmFactory,
        powerbi.factories.wpmpFactory,
        powerbi.factories.routerFactory
      );

      // reset ก่อน embed ใหม่เสมอ
      powerbiService.reset(embedRef.current);

      // embed report
      const embeddedReport = powerbiService.embed(embedRef.current, embedConfig);
      setReport(embeddedReport);

      // event: report โหลดเสร็จ
      embeddedReport.on("loaded", () => {
        console.log("✅ Report loaded");
      });

      // event: report render เสร็จ
      embeddedReport.on("rendered", () => {
        console.log("✅ Report rendered");
      });

      // event: error
      embeddedReport.on("error", (event) => {
        console.error("❌ Report error:", event.detail);
      });

      // clean up ตอน component จะ unmount หรือ embedToken เปลี่ยน
      return () => {
        embeddedReport.off("loaded");
        embeddedReport.off("rendered");
        embeddedReport.off("error");
        powerbiService.reset(embedRef.current);
      };
    }
  }, [embedToken]);

  // ฟังก์ชันเปลี่ยนหน้า report
  const goToPage = async (pageNumber) => {
    if (report) {
      try {
        const pages = await report.getPages();
        if (pages.length > pageNumber) {
          await pages[pageNumber].setActive();
          console.log(`✅ Switched to Page ${pageNumber + 1}`);
        } else {
          console.error("❌ Page Number Out of Range");
        }
      } catch (error) {
        console.error("❌ Error switching page:", error);
      }
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "10px" }}>
        {[...Array(20).keys()].map((i) => (
          <button
            key={i}
            onClick={() => goToPage(i)}
            style={{ margin: "5px" }}
          >
            Page {i + 1}
          </button>
        ))}
      </div>
      <div ref={embedRef} style={{ width: "100%", height: "600px" }}></div>
    </div>
  );
};

export default PowerBIEmbed;
