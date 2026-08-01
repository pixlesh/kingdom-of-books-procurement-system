import { FunctionComponent } from 'react';
// Ignore missing CSS module type declarations in this file
// @ts-ignore
import styles from './BookDetailsMetadataView.module.css';


function BookDetailsMetadataView() {
    return (
        <div className={styles.bookDetailsMetadataView}>
            <div className={styles.topBarWrapper}>
                <div className={styles.topBar}>
                    <div className={styles.topBarLeft}>
                        <div className={styles.backArrowContainer}>
                            <div className={styles.iconWrapper}>
                                <img className={styles.arrowLeftIcon} alt="" />
                            </div>
                        </div>
                        <div className={styles.brand}>
                            <div className={styles.brandTitle}>
                                <img className={styles.vectorIcon} alt="" />
                                <div className={styles.instantBookLookUp}>Instant Book Look-up</div>
                            </div>
                            <div className={styles.metadataConsole}>METADATA CONSOLE</div>
                        </div>
                    </div>
                    <div className={styles.searchInputContainer}>
                        <div className={styles.iconWrapper}>
                            <img className={styles.arrowLeftIcon} alt="" />
                        </div>
                        <div className={styles.div}>978-9953582839</div>
                        <div className={styles.searchBtn}>
                            <div className={styles.instantBookLookUp}>Search</div>
                        </div>
                    </div>
                    <div className={styles.topBarRight}>
                        <div className={styles.langToggle}>
                            <div className={styles.langAr}>
                                <div className={styles.instantBookLookUp}>AR</div>
                            </div>
                            <div className={styles.langEn}>
                                <div className={styles.instantBookLookUp}>EN</div>
                            </div>
                        </div>
                        <div className={styles.themeToggle}>
                            <img className={styles.arrowLeftIcon} alt="" />
                        </div>
                    </div>
                </div>
            </div>
            <div className={styles.mainConsoleWrapper}>
                <div className={styles.leftSection}>
                    <div className={styles.coverContainer}>
                        <img className={styles.bookCoverImageIcon} alt="" />
                    </div>
                    <div className={styles.coverActions}>
                        <div className={styles.btn}>
                            <div className={styles.iconWrapper}>
                                <img className={styles.arrowLeftIcon} alt="" />
                            </div>
                            <div className={styles.instantBookLookUp}>Open Direct Image Link</div>
                        </div>
                        <div className={styles.imageQualityHigh}>★ Image Quality: High Resolution</div>
                    </div>
                </div>
                <div className={styles.centerSection}>
                    <div className={styles.metadataGridHeader}>
                        <div className={styles.indexedRecordMatches}>Indexed Record Matches</div>
                        <b className={styles.parsedSystemCore}>Parsed System Core Fields</b>
                    </div>
                    <div className={styles.metadataGrid}>
                        <div className={styles.metadataCard}>
                            <div className={styles.indexedRecordMatches}>Book Title</div>
                            <b className={styles.introductionToUi}>Introduction to UI Design</b>
                        </div>
                        <div className={styles.gridRow1}>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>Author Name</div>
                                <b className={styles.introductionToUi}>Sarah Jenkins</b>
                            </div>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>ISBN / Barcode</div>
                                <b className={styles.introductionToUi}>978-3-16-148410-0</b>
                            </div>
                        </div>
                        <div className={styles.gridRow1}>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>Page Count</div>
                                <b className={styles.introductionToUi}>320 pages</b>
                            </div>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>Release Year</div>
                                <b className={styles.introductionToUi}>2024</b>
                            </div>
                        </div>
                        <div className={styles.gridRow1}>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>Book Genre</div>
                                <b className={styles.introductionToUi}>Technology / Design</b>
                            </div>
                            <div className={styles.metadataCard2}>
                                <div className={styles.indexedRecordMatches}>Edition Number</div>
                                <b className={styles.introductionToUi}>2nd Edition</b>
                            </div>
                        </div>
                    </div>
                    <div className={styles.validationBar}>
                        <div className={styles.validationMessage}>
                            <div className={styles.iconWrapper4}>
                                <img className={styles.checkCircleIcon} alt="" />
                            </div>
                            <div className={styles.sourceDatabaseValidation}>Source database validation successful. Query matches standard.</div>
                        </div>
                        <div className={styles.statusBadge}>
                            <div className={styles.ellipse} />
                            <div className={styles.instantBookLookUp}>CHECKSUM: PASS</div>
                        </div>
                    </div>
                </div>
                <div className={styles.rightSection}>
                    <div className={styles.queueHeader}>
                        <b className={styles.procurementExportQueue}>Procurement Export Queue</b>
                        <div className={styles.queueBadge}>
                            <div className={styles.instantBookLookUp}>3 Items</div>
                        </div>
                    </div>
                    <div className={styles.queueList}>
                        <div className={styles.queueItem}>
                            <img className={styles.thumbnailIcon} alt="" />
                            <div className={styles.itemMeta}>
                                <div className={styles.theSovereignScholar}>Introduction to UI Design</div>
                                <div className={styles.hPVance}>Sarah Jenkins</div>
                            </div>
                            <div className={styles.removeBtn}>
                                <div className={styles.iconWrapper5}>
                                    <img className={styles.vectorIcon} alt="" />
                                </div>
                            </div>
                        </div>
                        <div className={styles.line} />
                        <div className={styles.queueItem}>
                            <img className={styles.thumbnailIcon} alt="" />
                            <div className={styles.itemMeta}>
                                <div className={styles.theSovereignScholar}>The Sovereign Scholar</div>
                                <div className={styles.hPVance}>H. P. Vance</div>
                            </div>
                            <div className={styles.removeBtn}>
                                <div className={styles.iconWrapper5}>
                                    <img className={styles.vectorIcon} alt="" />
                                </div>
                            </div>
                        </div>
                        <div className={styles.line} />
                        <div className={styles.queueItem}>
                            <img className={styles.thumbnailIcon} alt="" />
                            <div className={styles.itemMeta}>
                                <div className={styles.theSovereignScholar}>Advanced Rust Programming</div>
                                <div className={styles.hPVance}>A. C. Lonsdale</div>
                            </div>
                            <div className={styles.removeBtn}>
                                <div className={styles.iconWrapper5}>
                                    <img className={styles.vectorIcon} alt="" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={styles.queueFooter}>
                        <div className={styles.btn2}>
                            <div className={styles.iconWrapper}>
                                <img className={styles.arrowLeftIcon} alt="" />
                            </div>
                            <div className={styles.instantBookLookUp}>Export to Excel (.xlsx)</div>
                        </div>
                        <div className={styles.standardProcurementFormat}>Standard procurement format</div>
                    </div>
                </div>
            </div>
            <div className={styles.bottomActionBar}>
                <div className={styles.bottomActionsLeft}>
                    <div className={styles.btnPrimaryAddToCart}>
                        <div className={styles.iconWrapper}>
                            <img className={styles.arrowLeftIcon} alt="" />
                        </div>
                        <b className={styles.procurementExportQueue}>+ Add to Cart</b>
                    </div>
                </div>
                <div className={styles.bottomActionsRight} />
            </div>
            <div className={styles.footer}>
                <div className={styles.line} />
                <div className={styles.procurementExportQueue}>Kingdom of Books - Metadata View v2.1</div>
            </div>
        </div>);
}

export default BookDetailsMetadataView ;
