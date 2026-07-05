import unittest
from app.services.skin_factor_rules import calculate_skin_factors_from_raw_material_text
from data_tools.fetch_haccp_packaging_info import parse_haccp_response, build_haccp_skin_factors

class TestHaccpPackagingInfo(unittest.TestCase):
    def setUp(self):
        # Create a small dummy dictionary for tests
        self.dictionary = [
            {
                "name": "탈지분유",
                "normalized_name": "탈지분유",
                "aliases": [],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high"
                    }
                ]
            },
            {
                "name": "유청분말",
                "normalized_name": "유청분말",
                "aliases": [],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high"
                    }
                ]
            }
        ]
        
    def test_parse_haccp_response(self):
        xml_data = """<?xml version="1.0" encoding="UTF-8"?>
        <response>
            <body>
                <items>
                    <item>
                        <prdlstNm>테스트 우유</prdlstNm>
                        <barcode>123456789</barcode>
                        <prdlstReportNo>1234</prdlstReportNo>
                        <rawmtrl>정제수, 우유농축액</rawmtrl>
                        <allergy>우유</allergy>
                        <nutrient>나트륨 10mg</nutrient>
                        <manufacture>예그린</manufacture>
                        <seller>예그린</seller>
                        <prdkindstate>60g/1개</prdkindstate>
                        <prdkind>과자류(유처리제품)</prdkind>
                        <imgurl1>http://example.com/img1.jpg</imgurl1>
                        <imgurl2>http://example.com/img2.jpg</imgurl2>
                    </item>
                </items>
            </body>
        </response>
        """
        parsed = parse_haccp_response(xml_data)
        self.assertEqual(len(parsed), 1)
        item = parsed[0]
        self.assertEqual(item["product_name"], "테스트 우유")
        self.assertEqual(item["barcode"], "123456789")
        self.assertEqual(item["raw_material_text"], "정제수, 우유농축액")
        self.assertEqual(item["allergen_text"], "우유")
        self.assertEqual(item["source"], "haccp_packaging_api")
        self.assertEqual(item["manufacturer"], "예그린")
        self.assertEqual(item["seller"], "예그린")
        self.assertEqual(item["capacity"], "60g/1개")
        self.assertEqual(item["product_type"], "과자류(유처리제품)")
        self.assertEqual(item["image_url"], "http://example.com/img1.jpg")
        self.assertEqual(item["image_url_2"], "http://example.com/img2.jpg")

    def test_build_haccp_skin_factors_raw_material(self):
        item = {
            "raw_material_text": "탈지분유, 유청분말, 설탕",
            "allergen_text": ""
        }
        factors = build_haccp_skin_factors(item, self.dictionary)
        self.assertEqual(len(factors), 1)
        f = factors[0]
        self.assertEqual(f["key"], "dairy_confirmed")
        self.assertEqual(f["source"], "raw_material_dictionary")
        self.assertIn("raw_material:탈지분유", f["evidence"])
        self.assertIn("raw_material:유청분말", f["evidence"])
        
    def test_build_haccp_skin_factors_allergen(self):
        item = {
            "raw_material_text": "정제수, 설탕",
            "allergen_text": "대두, 우유 함유"
        }
        factors = build_haccp_skin_factors(item, self.dictionary)
        self.assertEqual(len(factors), 1)
        f = factors[0]
        self.assertEqual(f["key"], "dairy_confirmed")
        self.assertEqual(f["source"], "haccp_allergen_text")
        self.assertEqual(f["confidence"], "high")
        self.assertIn("allergen:우유", f["evidence"])

    def test_build_haccp_skin_factors_allergen_only_milk(self):
        # allergen_text만 "우유"인 경우에도 dairy_confirmed 생성.
        item = {
            "raw_material_text": "",
            "allergen_text": "우유"
        }
        factors = build_haccp_skin_factors(item, self.dictionary)
        self.assertEqual(len(factors), 1)
        f = factors[0]
        self.assertEqual(f["key"], "dairy_confirmed")
        self.assertEqual(f["source"], "haccp_allergen_text")
        self.assertIn("allergen:우유", f["evidence"])

    def test_build_haccp_skin_factors_flavoring_no_confirmed(self):
        # 크림향, 설탕 -> possible_dairy
        item = {
            "raw_material_text": "크림향, 설탕",
            "allergen_text": ""
        }
        # To test flavoring, we need "크림향" in dictionary mapped to dairy_confirmed, 
        # then it gets downgraded to possible_dairy
        custom_dict = [
            {
                "name": "크림향",
                "normalized_name": "크림향",
                "aliases": [],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high"
                    }
                ]
            }
        ]
        factors = build_haccp_skin_factors(item, custom_dict)
        self.assertEqual(len(factors), 1)
        self.assertEqual(factors[0]["key"], "possible_dairy")

    def test_build_haccp_skin_factors_merge(self):
        item = {
            "raw_material_text": "탈지분유, 우유농축액",
            "allergen_text": "우유"
        }
        custom_dict = self.dictionary + [
            {
                "name": "우유농축액",
                "normalized_name": "우유농축액",
                "aliases": [],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high"
                    }
                ]
            }
        ]
        factors = build_haccp_skin_factors(item, custom_dict)
        # Should merge into a single dairy_confirmed factor
        self.assertEqual(len(factors), 1)
        f = factors[0]
        self.assertEqual(f["key"], "dairy_confirmed")
        # Evidence should include both
        self.assertIn("raw_material:우유농축액", f["evidence"])
        self.assertIn("allergen:우유", f["evidence"])
        self.assertEqual(f["confidence"], "high")
        self.assertEqual(f["source"], "haccp_allergen_text")

if __name__ == "__main__":
    unittest.main()
