import time
import os
from tempfile import mkdtemp
from django.conf import settings

from testing.live_server import ChannelsLiveServerTestCase

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

from testing.selenium_helper import SeleniumHelper


class PandocTest(SeleniumHelper, ChannelsLiveServerTestCase):
    fixtures = ["initial_documenttemplates.json", "initial_styles.json"]

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.base_url = cls.live_server_url
        cls.download_dir = mkdtemp()
        driver_data = cls.get_drivers(1, cls.download_dir)
        cls.driver = driver_data["drivers"][0]
        cls.client = driver_data["clients"][0]
        cls.driver.implicitly_wait(driver_data["wait_time"])
        cls.wait_time = driver_data["wait_time"]

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()
        super().tearDownClass()

    def setUp(self):
        self.user = self.create_user(
            username="Yeti", email="yeti@snowman.com", passtext="otter1"
        )

    def test_export(self):
        self.login_user(self.user, self.driver, self.client)
        self.driver.get(self.base_url + "/")
        self.driver.set_window_size(1920, 1080)
        # Create chapter one doc
        WebDriverWait(self.driver, self.wait_time).until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, ".new_document button")
            )
        ).click()
        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located((By.CLASS_NAME, "editor-toolbar"))
        )
        # Set copyright
        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (
                    By.CSS_SELECTOR,
                    "#header-navigation > div:nth-child(3) > span",
                )
            )
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR,
            (
                "#header-navigation > div:nth-child(3) > "
                "div > ul > li:nth-child(6) > span"
            ),
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".holder").send_keys(
            "The Big Company"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".year").send_keys("2003")
        self.driver.find_element(By.CSS_SELECTOR, ".license").click()
        self.driver.find_element(
            By.CSS_SELECTOR, ".license > option:nth-child(4)"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".license-start").send_keys(
            "2001-04-06"
        )
        self.driver.find_element(
            By.CSS_SELECTOR,
            "[aria-describedby=configure-copyright] button.fw-dark",
        ).click()

        self.driver.find_element(By.CSS_SELECTOR, ".doc-title").click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-title").send_keys(
            "Title"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "No styling"
        )
        self.driver.find_element(
            By.CSS_SELECTOR, "button[title=Strong]"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "strong"
        )
        self.driver.find_element(
            By.CSS_SELECTOR, "button[title=Strong]"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, "button[title=Emphasis]"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "emph"
        )
        self.driver.find_element(
            By.CSS_SELECTOR, "button[title=Emphasis]"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.ENTER
        )
        self.driver.find_element(By.CSS_SELECTOR, ".fa-list-ol").click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "ordered list"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.ENTER
        )
        self.driver.find_element(By.CSS_SELECTOR, ".fa-list-ul").click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "bullet list"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.ENTER
        )
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.ENTER
        )
        self.driver.find_element(
            By.CSS_SELECTOR, "button[title=Blockquote]"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            "block quote"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.ENTER
        )
        self.driver.find_element(By.CSS_SELECTOR, ".fa-link").click()
        self.driver.find_element(By.CSS_SELECTOR, ".link-title").click()
        self.driver.find_element(By.CSS_SELECTOR, ".link-title").send_keys(
            "Sports"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".link").click()
        self.driver.find_element(By.CSS_SELECTOR, ".link").send_keys(
            "https://www.sports.com"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".fw-dark").click()
        self.driver.find_element(By.CSS_SELECTOR, ".fa-asterisk").click()
        self.driver.find_element(
            By.CSS_SELECTOR, ".footnote-container > p"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, ".footnote-container > p"
        ).send_keys("A footnote")
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").click()
        self.driver.find_element(By.CSS_SELECTOR, ".fa-book").click()
        # click on 'Register new source' button
        register_new_source = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.CLASS_NAME, "register-new-bib-source")
            )
        )
        register_new_source.click()

        # select source
        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located((By.ID, "select-bibtype"))
        )

        # click on article
        Select(
            self.driver.find_element(By.ID, "select-bibtype")
        ).select_by_visible_text("Article")

        # fill the values
        title_of_publication = self.driver.find_element(
            By.CSS_SELECTOR, ".journaltitle .ProseMirror"
        )
        title_of_publication.click()
        title_of_publication.send_keys("My publication title")

        title = self.driver.find_element(
            By.CSS_SELECTOR, ".title .ProseMirror"
        )
        title.click()
        title.send_keys("My title")

        author_firstName = self.driver.find_element(
            By.CSS_SELECTOR, ".author .given .ProseMirror"
        )
        author_firstName.click()
        author_firstName.send_keys("John")

        author_lastName = self.driver.find_element(
            By.CSS_SELECTOR, ".family .ProseMirror"
        )
        author_lastName.click()
        author_lastName.send_keys("Doe")

        publication_date = self.driver.find_element(
            By.CSS_SELECTOR, ".fw-date"
        )
        publication_date.click()
        publication_date.send_keys("2012")

        # click on Submit button
        self.driver.find_element(
            By.XPATH,
            '//*[contains(@class, "fw-button") and normalize-space()="Submit"]',
        ).click()

        # Wait for source to be listed
        WebDriverWait(self.driver, self.wait_time).until(
            EC.element_to_be_clickable(
                (
                    By.CSS_SELECTOR,
                    "#selected-cite-source-table .selected-source",
                )
            )
        )
        # click on Insert button
        self.driver.find_element(By.CSS_SELECTOR, ".insert-citation").click()
        self.driver.find_element(
            By.CSS_SELECTOR, 'button[title="Horizontal line"]'
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".doc-body").send_keys(
            Keys.DOWN
        )
        # Insert figure
        button = self.driver.find_element(By.XPATH, '//*[@title="Figure"]')
        button.click()

        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "#figure-dialog span.math-field")
            )
        )

        time.sleep(1)  # Needed to ensure next lines work

        # click on 'Insert image' button
        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.XPATH, '//*[normalize-space()="Insert image"]')
            )
        ).click()

        upload_button = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.XPATH, '//*[normalize-space()="Add new image"]')
            )
        )

        upload_button.click()

        # image path
        image_path = os.path.join(
            settings.PROJECT_PATH, "pandoc/tests/uploads/image.png"
        )

        # in order to select the image we send the image path in the
        # LOCAL MACHINE to the input tag
        upload_image_url = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.XPATH, '//*[@id="editimage"]/div[1]/input[2]')
            )
        )
        upload_image_url.send_keys(image_path)

        # click on 'Upload' button
        self.driver.find_element(
            By.XPATH,
            '//*[contains(@class, "fw-button") and normalize-space()="Upload"]',
        ).click()

        # click on 'Use image' button
        WebDriverWait(self.driver, self.wait_time).until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, ".fw-data-table i.fa-check")
            )
        )

        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Use image"]'
        ).click()

        # Set copyright info
        self.driver.find_element(
            By.CSS_SELECTOR, "div.figure-preview > div > span > i"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR,
            "body > div.fw-content-menu > div > div > ul > li:nth-child(1)",
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".holder").send_keys(
            "Johannes Wilm"
        )
        self.driver.find_element(By.CSS_SELECTOR, ".year").send_keys("1998")
        self.driver.find_element(By.CSS_SELECTOR, ".license").click()
        self.driver.find_element(
            By.CSS_SELECTOR, ".license > option:nth-child(2)"
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".license-start").send_keys(
            "1998-04-23"
        )
        WebDriverWait(self.driver, self.wait_time).until(
            EC.invisibility_of_element_located(
                (By.CSS_SELECTOR, "#fw-alerts-wrapper li.fw-visible")
            )
        )
        self.driver.find_element(
            By.CSS_SELECTOR,
            "[aria-describedby=configure-copyright] button.fw-dark",
        ).click()

        # click on 'Insert' button
        self.driver.find_element(By.CSS_SELECTOR, "button.fw-dark").click()

        caption = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div.doc-body figure figcaption")
            )
        )
        self.driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center'});", caption
        )
        caption.click()
        caption.send_keys("Figure")

        ActionChains(self.driver).send_keys(Keys.RIGHT).perform()
        # Add table
        self.driver.find_element(By.CSS_SELECTOR, ".fa-table").click()
        self.driver.find_element(
            By.CSS_SELECTOR,
            "table.insert-table-selection tr:nth-child(2) > td:nth-child(2)",
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, ".fw-dark").click()
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(1) > td:nth-child(1) > p"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(1) > td:nth-child(1) > p"
        ).send_keys("one")
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(1) > td:nth-child(2) > p"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(1) > td:nth-child(2) > p"
        ).send_keys("two")
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(2) > td:nth-child(1) > p"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(2) > td:nth-child(1) > p"
        ).send_keys("three")
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(2) > td:nth-child(2)"
        ).click()
        self.driver.find_element(
            By.CSS_SELECTOR, "tr:nth-child(2) > td:nth-child(2)"
        ).send_keys("four")
        # Add table caption
        self.driver.find_element(
            By.CSS_SELECTOR, "div.table-100 > button"
        ).click()
        WebDriverWait(self.driver, self.wait_time).until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    '(//div[contains(@class, "fw-content-menu")])'
                    '[last()]//li[contains(normalize-space(.), "Configure")]',
                )
            )
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, "div.table-category").click()
        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Table"]'
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, "div.table-caption").click()
        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Enable"]'
        ).click()
        self.driver.find_element(By.CSS_SELECTOR, "button.fw-dark").click()
        caption = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div.doc-body table caption")
            )
        )
        self.driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center'});", caption
        )

        caption.click()

        caption.send_keys("Table Caption")
        # Document with many features has been created let's see if we can
        # export it from the editor.

        # Export as Markdown
        self.driver.find_element(
            By.CSS_SELECTOR,
            '.header-nav-item[title="Export of the document contents"]',
        ).click()
        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Other formats"]'
        ).click()
        # The core editor's export menu has its own top-level "Markdown"
        # action since @fiduswriter/editor 0.2.39, so the unscoped XPath
        # matches that item instead of the plugin's "Markdown" submenu under
        # "Other formats" and closes the menu. Scope the click to the
        # innermost open pulldown (the "Other formats" submenu).
        self.retry_click(
            self.driver,
            (
                By.XPATH,
                '(//div[contains(@class, "fw-pulldown")])[last()]'
                '//*[normalize-space()="Markdown"]',
            ),
        )

        self.retry_click(
            self.driver,
            (By.XPATH, '//*[normalize-space()="Pandoc Markdown"]'),
        )
        path = os.path.join(self.download_dir, "title.markdown.zip")
        self.wait_until_file_exists(path, self.wait_time)
        assert os.path.isfile(path)
        os.remove(path)

        # Export as RTF
        self.driver.find_element(
            By.CSS_SELECTOR,
            '.header-nav-item[title="Export of the document contents"]',
        ).click()
        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Other formats"]'
        ).click()
        self.driver.find_element(
            By.XPATH, '//*[normalize-space()="Richtext"]'
        ).click()
        path = os.path.join(self.download_dir, "title.rtf")
        self.wait_until_file_exists(path, self.wait_time)
        assert os.path.isfile(path)
        os.remove(path)

    def test_import(self):
        self.login_user(self.user, self.driver, self.client)
        self.driver.get(self.base_url + "/")
        # Import an DOCX file
        # Click on button with title "Import document"
        self.driver.find_element(
            By.CSS_SELECTOR,
            "button.fw-text-menu[title='Import document (Alt-i)']",
        ).click()

        docx_path = os.path.join(
            settings.PROJECT_PATH, "pandoc/tests/uploads/import.docx"
        )
        # Wait for the file input to be present
        upload_file_input = WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located((By.ID, "doc-uploader"))
        )
        upload_file_input.send_keys(docx_path)

        # Click on "Import" button
        self.driver.find_element(By.CSS_SELECTOR, "button.fw-dark").click()
        # Wait for the document to be imported
        WebDriverWait(self.driver, self.wait_time).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "a.fw-data-table-title")
            )
        )
        # Check if the document has been imported
        self.assertIn(
            "Imported document",
            self.driver.find_element(
                By.CSS_SELECTOR, "a.fw-data-table-title"
            ).text,
        )
        # Enter document
        self.driver.find_element(
            By.CSS_SELECTOR, "a.fw-data-table-title"
        ).click()

        time.sleep(2)
        # Check if the document loads in the editor
        self.assertIn(
            "Imported document",
            self.driver.find_element(By.CSS_SELECTOR, "div.doc-title").text,
        )
